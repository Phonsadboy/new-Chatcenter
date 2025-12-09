const XLSX = require("xlsx");
const { ObjectId } = require("mongodb");
const fs = require("fs");
const crypto = require("crypto");

function generateDataItemId() {
    return `item_${crypto.randomBytes(8).toString('hex')}`;
}

function generateInstructionId() {
    return `inst_${crypto.randomBytes(6).toString('hex')}`;
}

class InstructionDataService {
    constructor(db) {
        this.db = db;
        this.collection = db.collection("instructions_v2");
    }

    sanitizeHeaderName(name) {
        const key = String(name ?? "").trim();
        if (!key) return "";
        if (key.toLowerCase().startsWith("__empty")) return "";
        return key;
    }

    sanitizeCellValue(value) {
        if (value === null || value === undefined) return "";
        if (value instanceof Date) return value.toISOString();
        if (typeof value === "number" && !Number.isFinite(value)) return "";
        return String(value);
    }

    buildDefaultColumns(count = 0) {
        const safeCount = Math.max(0, Number(count) || 0);
        return Array.from({ length: safeCount }, (_, idx) => `คอลัมน์ ${idx + 1}`);
    }

    normalizeColumns(columns, fallbackCount = 0) {
        const cleaned = Array.isArray(columns) ? columns.map(col => this.sanitizeHeaderName(col)) : [];
        const base = cleaned.filter(Boolean);
        const cols = base.length ? base : this.buildDefaultColumns(fallbackCount);
        const used = new Map();
        return cols.map((col, idx) => {
            const baseName = col || `คอลัมน์ ${idx + 1}`;
            const count = used.get(baseName) || 0;
            used.set(baseName, count + 1);
            return count === 0 ? baseName : `${baseName} (${count + 1})`;
        });
    }

    normalizeRowToColumns(row, columns) {
        if (!Array.isArray(columns) || columns.length === 0) return [];
        if (Array.isArray(row)) {
            const copy = [...row];
            while (copy.length < columns.length) copy.push("");
            if (copy.length > columns.length) copy.length = columns.length;
            return copy.map(val => this.sanitizeCellValue(val));
        }
        if (row && typeof row === "object") {
            return columns.map(col => this.sanitizeCellValue(row[col]));
        }
        return columns.map(() => "");
    }

    normalizeTableData(item) {
        const tryParse = (val) => {
            if (typeof val === "string") {
                try {
                    return JSON.parse(val);
                } catch {
                    return val;
                }
            }
            return val;
        };

        const sourceData = item?.data ?? item?.content ?? item;
        const candidate = tryParse(sourceData);

        let columns = [];
        let rows = [];

        if (candidate && typeof candidate === "object" && Array.isArray(candidate.columns) && Array.isArray(candidate.rows)) {
            columns = this.normalizeColumns(candidate.columns, candidate.rows[0]?.length || candidate.columns.length);
            rows = candidate.rows.map(row => this.normalizeRowToColumns(row, columns));
        } else if (candidate && typeof candidate === "object" && Array.isArray(candidate.rows)) {
            const inferredColumns = Array.isArray(candidate.columns) ? candidate.columns : [];
            const longestRow = candidate.rows.reduce((max, row) => {
                if (Array.isArray(row)) return Math.max(max, row.length);
                if (row && typeof row === "object") return Math.max(max, Object.keys(row).length);
                return max;
            }, 0);
            columns = this.normalizeColumns(inferredColumns, longestRow);
            rows = candidate.rows.map(row => this.normalizeRowToColumns(row, columns));
        } else if (Array.isArray(candidate)) {
            if (candidate.some(row => row && typeof row === "object" && !Array.isArray(row))) {
                const objectRows = candidate.map(row => (row && typeof row === "object") ? row : {});
                const colSet = [];
                objectRows.forEach(row => {
                    Object.keys(row || {}).forEach(key => {
                        const clean = this.sanitizeHeaderName(key);
                        if (clean && !colSet.includes(clean)) colSet.push(clean);
                    });
                });
                columns = this.normalizeColumns(colSet, colSet.length || Object.keys(objectRows[0] || {}).length);
                rows = objectRows.map(row => this.normalizeRowToColumns(row, columns));
            } else {
                const longestRow = candidate.reduce((max, row) => Array.isArray(row) ? Math.max(max, row.length) : max, 0);
                columns = this.normalizeColumns([], longestRow);
                rows = candidate.map(row => this.normalizeRowToColumns(row, columns));
            }
        } else {
            columns = [];
            rows = [];
        }

        if (!columns.length && rows.length) {
            const longestRow = rows.reduce((max, row) => Math.max(max, row.length), 0);
            columns = this.normalizeColumns([], longestRow);
            rows = rows.map(row => this.normalizeRowToColumns(row, columns));
        }

        return { columns, rows };
    }

    buildTableDataFromSheetRows(rawRows, headerRow = []) {
        if (!Array.isArray(rawRows)) return { columns: [], rows: [] };
        const columnOrder = [];
        rawRows.forEach(row => {
            Object.keys(row || {}).forEach(key => {
                const clean = this.sanitizeHeaderName(key);
                if (clean && !columnOrder.includes(clean)) {
                    columnOrder.push(clean);
                }
            });
        });

        if (columnOrder.length === 0 && Array.isArray(headerRow)) {
            headerRow.forEach(header => {
                const clean = this.sanitizeHeaderName(header);
                if (clean && !columnOrder.includes(clean)) {
                    columnOrder.push(clean);
                }
            });
        }

        const columns = this.normalizeColumns(columnOrder, columnOrder.length);
        const rows = rawRows.map(row => this.normalizeRowToColumns(row, columns));
        return { columns, rows };
    }

    mergeTableData(existingData, incomingData, mode = "append") {
        const baseExisting = this.normalizeTableData({ data: existingData });
        const incoming = this.normalizeTableData({ data: incomingData });

        if (mode === "replace") {
            return incoming;
        }

        const unionColumns = [];
        [...baseExisting.columns, ...incoming.columns].forEach(col => {
            const name = this.sanitizeHeaderName(col) || col;
            if (name && !unionColumns.includes(name)) {
                unionColumns.push(name);
            }
        });
        const columns = this.normalizeColumns(
            unionColumns,
            unionColumns.length || Math.max(baseExisting.columns.length, incoming.columns.length)
        );

        const mapRow = (row, sourceCols) => {
            const valueByCol = new Map();
            sourceCols.forEach((col, idx) => valueByCol.set(col, row[idx]));
            return columns.map(col => this.sanitizeCellValue(valueByCol.get(col)));
        };

        const mergedRows = [
            ...baseExisting.rows.map(row => mapRow(row, baseExisting.columns)),
            ...incoming.rows.map(row => mapRow(row, incoming.columns)),
        ];

        return { columns, rows: mergedRows };
    }

    normalizeTableRows(item) {
        const normalized = this.normalizeTableData(item);
        return normalized.rows || [];
    }

    /**
     * Parse Excel file and return list of sheets with preview data
     * @param {string} filePath - Path to the uploaded file
     */
    previewImportSheets(filePath) {
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const previews = [];

        for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (!rows || rows.length === 0) {
                 previews.push({
                    sheetName: sheetName,
                    totalRows: 0,
                    headers: [],
                    previewData: []
                });
                continue;
            }

            // Extract headers (row 1)
            const headers = rows[0];

            // Extract preview data (rows 2-6)
            const dataRows = rows.slice(1, 6);
            const previewData = dataRows.map(row => {
                const rowObj = {};
                headers.forEach((header, index) => {
                    // Only map if header exists and row has value
                    if (header) rowObj[header] = row[index] !== undefined ? row[index] : "";
                });
                return rowObj;
            });

            previews.push({
                sheetName: sheetName,
                totalRows: rows.length - 1, // Exclude header
                headers: headers,
                previewData: previewData
            });
        }

        return previews;
    }

    /**
     * Execute import based on user mapping
     * @param {Array} mappings - Array of { sheetName, action, targetId, targetName, mode }
     * @param {string} filePath - Path to the uploaded file
     */
    async executeImport(mappings, filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error("File not found or expired.");
        }

        const workbook = XLSX.readFile(filePath);
        const results = [];

        for (const map of mappings) {
            try {
                const { sheetName, action, targetId, targetName, mode } = map;

                if (action === 'ignore') continue;

                const sheet = workbook.Sheets[sheetName];
                if (!sheet) {
                    results.push({ sheetName, success: false, error: "Sheet not found" });
                    continue;
                }

                // Convert to JSON using headers
                const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
                const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })?.[0] || [];
                const tableData = this.buildTableDataFromSheetRows(rawData, headerRow);

                if (!tableData.columns.length) {
                    results.push({ sheetName, success: false, error: "ไม่พบหัวคอลัมน์ในไฟล์" });
                    continue;
                }

                if (action === 'create') {
                    const now = new Date();
                    const dataItem = {
                        itemId: generateDataItemId(),
                        title: "Main Data",
                        type: "table",
                        order: 0,
                        content: "",
                        data: tableData,
                        createdAt: now,
                        updatedAt: now
                    };

                    const newInstruction = {
                        instructionId: generateInstructionId(),
                        name: targetName || sheetName,
                        description: `Imported from ${sheetName}`,
                        dataItems: [dataItem],
                        usageCount: 0,
                        isActive: true,
                        updatedAt: now,
                        createdAt: now
                    };
                    
                    await this.collection.insertOne(newInstruction);
                    results.push({ sheetName, success: true, action: 'created', targetName: newInstruction.name });

                } else if (action === 'update') {
                    if (!ObjectId.isValid(targetId)) {
                        results.push({ sheetName, success: false, error: "Invalid Target ID" });
                        continue;
                    }

                    const instruction = await this.collection.findOne({ _id: new ObjectId(targetId) });
                    if (!instruction) {
                        results.push({ sheetName, success: false, error: "Target instruction not found" });
                        continue;
                    }

                    const newItems = instruction.dataItems ? [...instruction.dataItems] : [];
                    let targetItem = newItems.find(item => item.type === 'table');
                    const mergeMode = mode === 'replace' ? 'replace' : 'append';
                    
                    if (!targetItem) {
                         // Create new table item if none exists
                         targetItem = {
                            itemId: generateDataItemId(),
                            title: sheetName,
                            type: "table",
                            order: newItems.length,
                            content: "",
                            data: tableData,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        newItems.push(targetItem);
                    } else {
                        // Update existing table item
                        targetItem.data = this.mergeTableData(targetItem.data, tableData, mergeMode);
                        targetItem.updatedAt = new Date();
                        // Replace in array
                        const index = newItems.findIndex(i => i.itemId === targetItem.itemId);
                        if (index !== -1) newItems[index] = targetItem;
                    }

                    await this.collection.updateOne(
                        { _id: new ObjectId(targetId) },
                        { $set: { dataItems: newItems, updatedAt: new Date() } }
                    );
                    results.push({ sheetName, success: true, action: 'updated', targetName: instruction.name });
                }
            } catch (err) {
                console.error(`Error importing sheet ${map.sheetName}:`, err);
                results.push({ sheetName: map.sheetName, success: false, error: err.message });
            }
        }
        
        return results;
    }
    
    /**
     * Export selected instructions to a multi-sheet Excel file
     * @param {Array} instructionIds - Array of instruction IDs (strings)
     * @returns {Buffer} Excel file buffer
     */
     async exportInstructions(instructionIds) {
        const workbook = XLSX.utils.book_new();
        
        const ids = instructionIds.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
        
        if(ids.length === 0) {
             throw new Error("No valid instruction IDs provided.");
        }

        const instructions = await this.collection.find({ _id: { $in: ids } }).toArray();
        
        if (instructions.length === 0) {
            throw new Error("No instructions found to export.");
        }

        for (const inst of instructions) {
            // Sanitize sheet name
            let sheetName = (inst.name || "Untitled").replace(/[\\/?*[\]]/g, "_").substring(0, 31);
            
            // Ensure unique sheet name
            let counter = 1;
            let originalSheetName = sheetName;
            while(workbook.SheetNames.includes(sheetName)) {
                sheetName = `${originalSheetName.substring(0, 28)}_${counter}`;
                counter++;
            }

            const dataItems = Array.isArray(inst.dataItems) ? inst.dataItems : [];
            const tableItem = dataItems.find(i => i.type === 'table');
            const tableData = this.normalizeTableData(tableItem);
            const hasTableData = tableData.columns.length > 0;

            let worksheet;
            if (hasTableData) {
                const sheetRows = tableData.rows.map(row => {
                    const obj = {};
                    tableData.columns.forEach((col, idx) => {
                        obj[col] = row[idx];
                    });
                    return obj;
                });

                worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: tableData.columns });
                if (sheetRows.length === 0) {
                    // json_to_sheet with empty rows keeps header, but ensure it exists explicitly
                    XLSX.utils.sheet_add_aoa(worksheet, [tableData.columns], { origin: "A1" });
                }
            } else {
                // Fallback: export all data items as rows soไฟล์ไม่เปล่า
                const rows = dataItems.map(item => ({
                    type: item.type || '',
                    title: item.title || '',
                    content: item.content || '',
                    order: item.order ?? ''
                }));

                if (!rows.length) {
                    rows.push({ note: 'ไม่มีข้อมูลใน instruction นี้' });
                }

                worksheet = XLSX.utils.json_to_sheet(rows);
            }

            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
        
        return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
     }
}

module.exports = InstructionDataService;
