/* ===================================
   PERFORMANCE UTILITIES
   ChatCenter AI - Performance Optimizations
   =================================== */

/**
 * 1. Debounce - ลดการเรียก function บ่อยเกินไป
 * ใช้สำหรับ: search input, window resize
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 2. Throttle - จำกัดจำนวนครั้งในช่วงเวลา
 * ใช้สำหรับ: scroll events, mouse move
 */
function throttle(func, limit = 300) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 3. Request Cache - เก็บผลลัพธ์ API
 */
class RequestCache {
    constructor(ttl = 5 * 60 * 1000) {  // 5 นาที
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        // ตรวจสอบว่าหมดอายุหรือยัง
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return cached.value;
    }

    has(key) {
        return this.get(key) !== null;
    }

    clear() {
        this.cache.clear();
    }

    delete(key) {
        this.cache.delete(key);
    }
}

/**
 * 4. Optimized Fetch with Cache
 */
class OptimizedFetch {
    constructor() {
        this.cache = new RequestCache();
        this.pendingRequests = new Map();
    }

    async fetch(url, options = {}) {
        const cacheKey = `${url}_${JSON.stringify(options)}`;

        // ตรวจสอบ cache ก่อน
        if (options.cache !== false) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // ตรวจสอบว่ามี request pending อยู่หรือไม่
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        // สร้าง request ใหม่
        const request = fetch(url, options)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                return res.json();
            })
            .then(data => {
                this.cache.set(cacheKey, data);
                this.pendingRequests.delete(cacheKey);
                return data;
            })
            .catch(err => {
                this.pendingRequests.delete(cacheKey);
                throw err;
            });

        this.pendingRequests.set(cacheKey, request);
        return request;
    }

    clearCache() {
        this.cache.clear();
    }
}

/**
 * 5. Lazy Load Images
 */
class LazyImageLoader {
    constructor() {
        this.observer = null;
        this.init();
    }

    init() {
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        this.loadImage(img);
                        this.observer.unobserve(img);
                    }
                });
            }, {
                rootMargin: '50px',
                threshold: 0.01
            });
        }
    }

    loadImage(img) {
        const src = img.dataset.src;
        if (!src) return;

        img.classList.add('loading');

        const tempImg = new Image();
        tempImg.onload = () => {
            img.src = src;
            img.classList.remove('loading');
            img.classList.add('loaded');
        };
        tempImg.onerror = () => {
            img.src = '/assets/placeholder.jpg';
            img.classList.add('error');
            img.classList.remove('loading');
        };
        tempImg.src = src;
    }

    observe(elements) {
        if (!this.observer) {
            // Fallback สำหรับ browser เก่า
            elements.forEach(img => this.loadImage(img));
            return;
        }

        elements.forEach(el => this.observer.observe(el));
    }
}

/**
 * 6. Smart Polling - Auto adjust interval based on visibility
 */
class SmartPoller {
    constructor(callback, defaultInterval = 30000) {
        this.callback = callback;
        this.defaultInterval = defaultInterval;
        this.activeInterval = defaultInterval;
        this.inactiveInterval = defaultInterval * 2;
        this.timeoutId = null;
        this.isRunning = false;

        // ฟัง visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isRunning) {
                this.callback(); // เรียกทันทีเมื่อกลับมา
            }
        });
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.poll();
    }

    stop() {
        this.isRunning = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    async poll() {
        if (!this.isRunning) return;

        try {
            await this.callback();
        } catch (err) {
            console.error('Polling error:', err);
        }

        // ปรับ interval ตาม visibility
        const interval = document.hidden ? this.inactiveInterval : this.activeInterval;
        this.timeoutId = setTimeout(() => this.poll(), interval);
    }
}

/**
 * 7. Memory-efficient Array Operations
 */
const arrayUtils = {
    // Chunk array เป็นกลุ่มเล็ก ๆ
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    // ลบ duplicates
    unique(array, key = null) {
        if (!key) {
            return [...new Set(array)];
        }
        const seen = new Set();
        return array.filter(item => {
            const val = item[key];
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
        });
    }
};

// Export
window.performanceUtils = {
    debounce,
    throttle,
    RequestCache,
    OptimizedFetch,
    LazyImageLoader,
    SmartPoller,
    arrayUtils
};
