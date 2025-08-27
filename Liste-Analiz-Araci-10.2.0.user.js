// ==UserScript==
// @name         Liste Analiz ve Yorum Botu Aracı (AI Entegreli)
// @namespace    vm-x-list-reply-analyzer-dom
// @version      10.2.0
// @description  Yapay zeka destekli yorum botu, birleştirilmiş kullanıcı çekme (takipçi, liste, yorumcu), analiz ve otomasyon araçları. Open Router API ile entegre çalışır. Gelişmiş analiz ve otomasyon özellikleri sunar.
// @match        https://*.x.com/*
// @match        https://*.twitter.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_openInTab
// ==/UserScript==
(() => {
    'use strict';
    // Configuration Constants - Centralized settings to reduce hard-coded values
    const CONFIG = {
        SITE: {
            HOST: location.host.includes('x.com') ? 'x.com' : 'twitter.com',
            RATE_LIMIT_DELAY: 60000, // 1 minute wait on rate limit
            MAX_RETRY_ATTEMPTS: 3,
            NETWORK_TIMEOUT: 600000 // 10 minutes timeout
        },
        DEFAULTS: {
            LAST_N: 5,
            MAX_RS: 300,
            SCROLL_DELAY: 1500,
            GLOBAL_SCROLL_STEPS: 120,
            BATCH_SIZE: 50, // For large user lists
            TOP_TWEETS: 10,
            MIN_VIEW_THRESHOLD: 1000,
            PROFILE_WAIT_DELAY: 5, // Default 5 seconds between profiles
            POPUP_LIMIT: 0,
            POPUP_SCROLL_DELAY: 800, // Increased delay for better loading
            COMMENT_LIMIT: 0,
            COMMENT_DELAY: 1000,
            EXECUTION_MODE: 'background' // 'background', 'window', 'tab'
        },
        BOT: {
            TWEET_AGE_LIMIT_MINUTES: 1,
            API_URL: 'https://openrouter.ai/api/v1',
            DEFAULT_PARAMS: {
                top_k: 50,
                top_p: 0.95,
                max_tokens: 100,
                temperature: 1.3,
                presence_penalty: 0.7,
                frequency_penalty: 0.3
            }
        },
        LIMITS: {
            MAX_CONCURRENT_TABS: 3,
            MAX_SCROLL_TIMEOUT: 600000,
            MAX_USER_LIST_SIZE: 1000,
            MAX_USERNAME_LENGTH: 20
        },
        UI: {
            DEBOUNCE_DELAY: 100,
            PROGRESS_UPDATE_INTERVAL: 200,
            STATUS_DISPLAY_TIME: 2000
        }
    };
    // Language Support - Multi-language interface
    const LANG = {
        TR: {
            READY: 'Hazır',
            START: 'Başlat',
            PAUSE: 'Duraklat',
            RESUME: 'Devam Et',
            STOP: 'Durdur',
            CLEAR: 'Temizle',
            DOWNLOAD: 'İndir',
            SAVE: 'Kaydet',
            ERROR: 'Hata',
            WARNING: 'Uyarı',
            SUCCESS: 'Başarılı',
            ANALYZING: 'Analiz ediliyor',
            COMPLETED: 'Tamamlandı',
            CANCELLED: 'İptal edildi',
            RATE_LIMITED: 'Hız sınırına takıldı',
            NETWORK_ERROR: 'Ağ hatası',
            PRIVATE_ACCOUNT: 'Gizli hesap',
            DELETED_USER: 'Silinmiş kullanıcı',
            PROCESSING: 'İşleniyor'
        },
        EN: {
            READY: 'Ready',
            START: 'Start',
            PAUSE: 'Pause',
            RESUME: 'Resume',
            STOP: 'Stop',
            CLEAR: 'Clear',
            DOWNLOAD: 'Download',
            SAVE: 'Save',
            ERROR: 'Error',
            WARNING: 'Warning',
            SUCCESS: 'Success',
            ANALYZING: 'Analyzing',
            COMPLETED: 'Completed',
            CANCELLED: 'Cancelled',
            RATE_LIMITED: 'Rate limited',
            NETWORK_ERROR: 'Network error',
            PRIVATE_ACCOUNT: 'Private account',
            DELETED_USER: 'Deleted user',
            PROCESSING: 'Processing'
        }
    };
    // Current language (default Turkish)
    let currentLang = LANG.TR;
    // Enhanced Selector System with Fallbacks
    const SELECTORS = {
        TWEET: {
            ARTICLE: ['article[data-testid="tweet"]', 'article[role="article"]', '[data-testid="tweet"]'],
            TEXT: ['div[data-testid="tweetText"]', '[data-testid="tweetText"]', '.tweet-text'],
            AUTHOR: ['div[data-testid="User-Name"] a[href^="/"][role="link"]', 'a[href^="/"][role="link"]'],
            PERMALINK: ['a[role="link"][href*="/status/"]', 'a[href*="/status/"]'],
            REPLY_COUNT: ['button > div > div.css-175oi2r.r-xoduu5.r-1udh08x > span', '[data-testid="reply"] span', 'button[aria-label*="repl"] span'],
            TIME: ['time'],
            REPLY_BUTTON: ['[data-testid="reply"]'],
            TWEET_BUTTON: ['[data-testid="tweetButton"]'],
            REPLY_TEXTBOX: ['div[role="textbox"]']
        },
        VERIFICATION: {
            VERIFIED: ['svg[data-testid="icon-verified"]', '[data-testid="icon-verified"]', 'svg[aria-label*="Verified"]', 'svg[data-testid="verifiedBadge"]'],
            GOVERNMENT: ['svg[data-testid="icon-government"]', '[data-testid="icon-government"]'],
            PREMIUM: ['svg[data-testid="icon-premium"]', '[data-testid="icon-premium"]', 'svg[data-testid="goldBadge"]']
        },
        POPUP: {
            CONTAINER: ['#layers div[aria-modal="true"] div[style*="overflow-y: scroll"]', 'div[aria-modal="true"] section[role="region"]', '[role="dialog"] [style*="overflow-y: scroll"]'],
            USER_BUTTON: ['#layers div[data-testid="UserCell"]', 'div[data-testid="UserCell"]']
        },
        PROFILE: {
            USER_CELL: ['div[data-testid="cellInnerDiv"]', 'div[data-testid="UserCell"]']
        },
        MAIN: {
            CONTENT: ['main', '[role="main"]', '#react-root main']
        },
        VIEWS: {
            COUNT: ['#id__5hbngjvlb8m > div:nth-child(4) > a > div > div.css-175oi2r.r-xoduu5.r-1udh08x > span > span > span', '#id__43yqj4g0ddn > div:nth-child(4) > a > div > div.css-175oi2r.r-xoduu5.r-1udh08x > span > span', '#id__054h2d6dh1jt > div:nth-child(4) > a > div > div.css-175oi2r.r-xoduu5.r-1udh08x > span > span', '#id__wn307zcllig > div:nth-child(4) > a > div > div.css-175oi2r.r-xoduu5.r-1udh08x > span > span', '[data-testid="analytics"] span', 'a[href*="/analytics"] span', '[aria-label*="görüntülenme"] span', '[aria-label*="views"] span', 'div[role="group"] > div:last-child span', '[data-testid="analytics"]', '[aria-label*="view"] span']
        }
    };
    // Sentiment Lexicon
    const SENTIMENT_LEXICON = {
        positive: ['güzel', 'harika', 'muhteşem', 'başarılı', 'iyi', 'mükemmel', 'sevindirici', 'mutlu', 'keyifli', 'etkili', 'amazing', 'great', 'awesome', 'good', 'excellent', 'wonderful', 'fantastic', 'perfect'],
        negative: ['kötü', 'berbat', 'korkunç', 'başarısız', 'üzücü', 'kızgın', 'sinir', 'nefret', 'problem', 'hata', 'bad', 'terrible', 'awful', 'horrible', 'sad', 'angry', 'hate', 'problem', 'error', 'fail']
    };
    // Global Variables
    let ANALYSIS_RUNNING = false;
    let ANALYSIS_PAUSED = false;
    let ANALYSIS_CANCELLED = false;
    let USER_SCRAPING_RUNNING = false;
    let VIEWS_ANALYSIS_RUNNING = false;
    let COMMENT_BOT_RUNNING = false;
    let SCRIPT_RUNNING = true;
    let openTabs = [];
    let activeObservers = [];
    let retryAttempts = new Map();
    let rateLimitDetected = false;
    let analysisHistory = [];
    let chartJSLoaded = false;

    // Web Worker to prevent background tab throttling
    const startKeepAliveWorker = () => {
        if (window.laKeepAliveWorker) return; // Worker already running in this tab
        try {
            const workerCode = `
                // This worker's sole purpose is to send a message every 15 seconds
                // to keep the main thread's event loop active, preventing the browser
                // from throttling timers in the background tab. This is crucial for
                // analyses running in inactive tabs or minimized windows.
                setInterval(() => {
                    postMessage('keep-alive-tick');
                }, 15000);
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            const worker = new Worker(workerUrl);

            // Storing the worker in a global window variable to access it later for termination
            window.laKeepAliveWorker = worker;
            console.log('Keep-alive worker started to prevent background throttling.');

            // Add a listener to terminate the worker when the page is about to be unloaded
            window.addEventListener('beforeunload', () => {
                if (window.laKeepAliveWorker) {
                    window.laKeepAliveWorker.terminate();
                    console.log('Keep-alive worker terminated.');
                }
            });
        } catch (error) {
            console.error('Failed to initialize keep-alive worker:', error);
        }
    };
    // Enhanced Utility Functions
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    // Enhanced element finder with multiple selector fallbacks
    const findElement = (selectors, parent = document) => {
        if (typeof selectors === 'string') selectors = [selectors];
        for (const selector of selectors) {
            try {
                const element = parent.querySelector(selector);
                if (element) return element;
            } catch (e) {
                console.warn(`Invalid selector: ${selector}`);
            }
        }
        return null;
    };
    const findElements = (selectors, parent = document) => {
        if (typeof selectors === 'string') selectors = [selectors];
        for (const selector of selectors) {
            try {
                const elements = parent.querySelectorAll(selector);
                if (elements.length > 0) return elements;
            } catch (e) {
                console.warn(`Invalid selector: ${selector}`);
            }
        }
        return [];
    };
    // Enhanced until function with retry mechanism
    const until = async (fn, { timeout = 45000, interval = 500, retries = CONFIG.SITE.MAX_RETRY_ATTEMPTS } = {}) => {
        const st = Date.now();
        let attempt = 0;
        while (attempt < retries) {
            try {
                const v = await fn();
                if (v) return v;
            } catch (error) {
                console.warn(`Attempt ${attempt + 1} failed:`, error.message);
                if (isRateLimited(error)) {
                    rateLimitDetected = true;
                    await handleRateLimit();
                    return null;
                }
            }
            if (Date.now() - st > timeout) {
                attempt++;
                if (attempt < retries) {
                    await sleep(CONFIG.SITE.RATE_LIMIT_DELAY);
                    continue;
                }
                break;
            }
            await sleep(interval);
        }
        return null;
    };
    // Rate limit detection
    const isRateLimited = (error) => {
        if (!error) return false;
        const rateLimitIndicators = ['rate limit', '429', 'too many requests', 'captcha'];
        const errorMsg = error.message?.toLowerCase() || '';
        return rateLimitIndicators.some(indicator => errorMsg.includes(indicator));
    };
    // Handle rate limit detection
    const handleRateLimit = async () => {
        rateLimitDetected = true;
        const iframe = document.querySelector('#la-ui-frame');
        if (iframe?.contentDocument) {
            const doc = iframe.contentDocument;
            const statusEl = doc.querySelector('#la-status');
            if (statusEl) {
                statusEl.textContent = `${currentLang.RATE_LIMITED} - ${Math.ceil(CONFIG.SITE.RATE_LIMIT_DELAY / 1000)}s bekleniyor...`;
                statusEl.className = 'muted status warning';
            }
        }
        await sleep(CONFIG.SITE.RATE_LIMIT_DELAY);
        rateLimitDetected = false;
    };
    // Enhanced input validation and sanitization
    const sanitizeInput = (input) => {
        if (typeof input !== 'string') return '';
        return input
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/[<>&"']/g, '') // Remove potential XSS characters
            .trim();
    };
    const validateUsername = (username) => {
        const sanitized = sanitizeInput(username.replace(/^@/, ''));
        return /^[A-Za-z0-9_]{1,20}$/.test(sanitized) ? sanitized : null;
    };
    // Memory management functions
    const cleanupResources = () => {
        // Close all open tabs
        openTabs.forEach(tab => {
            try {
                if (tab && !tab.closed) tab.close();
            } catch (e) {
                console.warn('Failed to close tab:', e);
            }
        });
        openTabs = [];
        // Disconnect all observers
        activeObservers.forEach(observer => {
            try {
                observer.disconnect();
            } catch (e) {
                console.warn('Failed to disconnect observer:', e);
            }
        });
        activeObservers = [];
        // Clear retry attempts
        retryAttempts.clear();
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    };
    const isTweetDetail = () => /\/status\/\d+/.test(location.pathname);
    const isListMembersPage = () => /\/i\/lists\/\d+\/members/.test(location.pathname);
    const isProfileFollowListPage = () => /\/(followers|following|verified_followers)$/.test(location.pathname);
    const getUsernameFromPath = () => {
        const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,20})(?:\/.*)?$/);
        return m ? validateUsername(m[1]) : null;
    };
    const csvEscape = (s) => {
        const t = String(s ?? '');
        return /[,"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
    const debounce = (fn, ms = CONFIG.UI.DEBOUNCE_DELAY) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), ms);
        };
    };
    // View number parser
    const parseViewNumber = (viewString) => {
        if (!viewString || typeof viewString !== 'string') return 0;
        // Enhanced parsing for Turkish and English number formats
        const cleanStr = viewString.replace(/[^\d.,KMBJNMlyarBin]/gi, '').toUpperCase();
        let number = parseFloat(cleanStr.replace(/,/g, '.'));
        if (isNaN(number)) {
            // Try parsing without decimal separators
            number = parseFloat(cleanStr.replace(/[^\dKMB]/gi, ''));
        }
        if (isNaN(number)) return 0;
        // Handle billion indicators (B, Milyar)
        if (cleanStr.includes('B') || cleanStr.includes('MILYAR')) return Math.round(number * 1000000000);
        // Handle million indicators (M, Milyon, Jn for Turkish "milyon")
        if (cleanStr.includes('M') || cleanStr.includes('MILYON') || cleanStr.includes('JN')) return Math.round(number * 1000000);
        // Handle thousand indicators (K, Bin)
        if (cleanStr.includes('K') || cleanStr.includes('BIN')) return Math.round(number * 1000);
        return Math.round(number);
    };
    // Extract view count from tweet
    const extractViewCountFromTweet = (tweetElement) => {
        try {
            // Try primary view count selectors with new priority selector
            for (const selector of SELECTORS.VIEWS.COUNT) {
                const element = findElement([selector], tweetElement);
                if (element) {
                    const text = element.textContent.trim();
                    if (text && /[\d.,KMBJNMlyarBin]/i.test(text)) {
                        const viewCount = parseViewNumber(text);
                        if (viewCount > 0) return viewCount;
                    }
                }
            }
            // Fallback selectors
            const fallbackSelectors = [
                'div[role="group"] span[title]',
                'a[aria-label*="view"] span',
                'span[data-testid*="view"]'
            ];
            for (const selector of fallbackSelectors) {
                const element = findElement([selector], tweetElement);
                if (element) {
                    const text = element.textContent.trim() || element.getAttribute('title') || '';
                    if (text && /[\d.,KMBJNMlyarBin]/i.test(text)) {
                        const viewCount = parseViewNumber(text);
                        if (viewCount > 0) return viewCount;
                    }
                }
            }
            return 0;
        } catch (error) {
            console.error('Error extracting view count:', error);
            return 0;
        }
    };
    // Sentiment analysis
    const analyzeSentiment = (text) => {
        if (!text) return { sentiment: 'neutral', score: 0 };
        const words = text.toLowerCase().split(/\W+/);
        let positiveScore = 0;
        let negativeScore = 0;
        words.forEach(word => {
            if (SENTIMENT_LEXICON.positive.includes(word)) positiveScore++;
            if (SENTIMENT_LEXICON.negative.includes(word)) negativeScore++;
        });
        const totalScore = positiveScore - negativeScore;
        let sentiment = 'neutral';
        if (totalScore > 0) sentiment = 'positive';
        else if (totalScore < 0) sentiment = 'negative';
        return { sentiment, score: totalScore };
    };
    // Desktop notification system
    const requestNotificationPermission = async () => {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    };
    const showDesktopNotification = (title, options = {}) => {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            new Notification(title, {
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                ...options
            });
        } catch (error) {
            console.warn('Failed to show notification:', error);
        }
    };
    // Chart.js integration
    const loadChartJS = async () => {
        if (chartJSLoaded) return true;
        try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            document.head.appendChild(script);
            return new Promise((resolve) => {
                script.onload = () => {
                    chartJSLoaded = true;
                    resolve(true);
                };
                script.onerror = () => resolve(false);
            });
        } catch (error) {
            console.error('Failed to load Chart.js:', error);
            return false;
        }
    };
    const createEngagementChart = (canvasId, data) => {
        if (!chartJSLoaded || !window.Chart) return null;
        try {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return null;
            return new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Görüntülenme',
                        data: data.values,
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to create chart:', error);
            return null;
        }
    };
    // Cross-tab communication
    const broadcastMessage = (message) => {
        try {
            localStorage.setItem('la_broadcast', JSON.stringify({
                timestamp: Date.now(),
                ...message
            }));
            localStorage.removeItem('la_broadcast');
        } catch (error) {
            console.warn('Failed to broadcast message:', error);
        }
    };
    // Views analysis for users
    const analyzeViewsForUsers = async (usernames, tweetCount, topCount, minThreshold, progressCallback, executionMode = 'background') => {
        try {
            VIEWS_ANALYSIS_RUNNING = true;
            const finalResults = [];
            let processed = 0;
            // Process each user individually
            for (let i = 0; i < usernames.length; i++) {
                const username = usernames[i];
                if (ANALYSIS_CANCELLED) break;
                // Handle pause state
                while (ANALYSIS_PAUSED && !ANALYSIS_CANCELLED) {
                    const state = getGlobalScriptState();
                    ANALYSIS_PAUSED = state.paused;
                    await sleep(500);
                }
                if (ANALYSIS_CANCELLED) break;
                // Start analysis for user in background tab
                const runId = `views_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                try {
                    const tab = openViewsWorkerTab(username, tweetCount, topCount, runId, executionMode);
                    openTabs.push(tab);
                    const result = await waitForResult(runId, CONFIG.SITE.NETWORK_TIMEOUT);
                    // Clean up tab
                    const tabIndex = openTabs.indexOf(tab);
                    if (tabIndex > -1) openTabs.splice(tabIndex, 1);
                    try {
                        if (tab && !tab.closed) tab.close();
                    } catch (e) {
                        console.warn('Failed to close tab:', e);
                    }
                    if (result && !result.error) {
                        finalResults.push({
                            username: result.username,
                            profileViewTotal: result.profileViewTotal || 0,
                            userTopTotal: result.userTopTotal || 0,
                            highViewEstimate: result.highViewEstimate || 0,
                            status: 'Başarılı'
                        });
                    } else {
                        finalResults.push({
                            username: username,
                            profileViewTotal: 0,
                            userTopTotal: 0,
                            highViewEstimate: 0,
                            status: 'Hatalı'
                        });
                    }
                } catch (error) {
                    console.error(`Views analysis failed for ${username}:`, error);
                    finalResults.push({
                        username: username,
                        profileViewTotal: 0,
                        userTopTotal: 0,
                        highViewEstimate: 0,
                        status: 'Hatalı'
                    });
                }
                processed++;
                if (progressCallback) {
                    progressCallback(Math.round((processed / usernames.length) * 100), username, i + 1, usernames.length, 'Kullanıcı tamamlandı');
                }
                // Add delay between requests to avoid rate limiting
                await sleep(randomDelay(1000, 2000));
            }
            return finalResults;
        } catch (error) {
            console.error('Views analysis error:', error);
            throw error;
        } finally {
            VIEWS_ANALYSIS_RUNNING = false;
        }
    };
    // Open worker tab for views analysis
    const openViewsWorkerTab = (username, tweetCount, topCount, runId, executionMode = 'background') => {
        const params = new URLSearchParams({
            vm_views_scan: '1',
            n: tweetCount,
            topCount: topCount,
            rid: runId
        });
        const url = `https://${CONFIG.SITE.HOST}/${encodeURIComponent(username)}?${params.toString()}`;
        let tab;
        try {
            switch (executionMode) {
                case 'window':
                    const windowName = `la_worker_views_${runId}`;
                    const windowFeatures = 'width=800,height=600,scrollbars=yes,resizable=yes';
                    tab = window.open(url, windowName, windowFeatures);
                    if (!tab) {
                        throw new Error('Yeni pencere açılamadı. Lütfen popup engelleyiciyi kontrol edin.');
                    }
                    break;
                case 'tab':
                    tab = gm.openInTab(url, { active: true, insert: true, setParent: true });
                    break;
                case 'background':
                default:
                    tab = gm.openInTab(url, { active: false, insert: true, setParent: true });
                    break;
            }
            if (executionMode !== 'background') {
                setTimeout(() => {
                    try {
                        if (tab && !tab.closed) {
                            tab.focus();
                        }
                    } catch (e) {
                        console.warn('Failed to focus tab/window:', e);
                    }
                }, 150);
            }
            return tab;
        } catch (error) {
            console.error(`Failed to open views worker for mode "${executionMode}":`, error);
            throw new Error(`Çalışan sekmesi/penceresi açılamadı (${executionMode}): ${error.message}`);
        }
    };
    // Enhanced GM wrapper with error handling and GM_xmlhttpRequest
    const gm = {
        setValue: (k, v) => {
            try {
                GM_setValue(k, v);
                return true;
            } catch (e) {
                console.error('GM_setValue failed:', e);
                return false;
            }
        },
        getValue: (k, d) => {
            try {
                return GM_getValue(k, d);
            } catch (e) {
                console.error('GM_getValue failed:', e);
                return d;
            }
        },
        addListener: (k, cb) => {
            try {
                return GM_addValueChangeListener(k, cb);
            } catch (e) {
                console.error('GM_addValueChangeListener failed:', e);
                return null;
            }
        },
        removeListener: (id) => {
            try {
                if (id) GM_removeValueChangeListener(id);
                return true;
            } catch (e) {
                console.error('GM_removeValueChangeListener failed:', e);
                return false;
            }
        },
        openInTab: (url, opts) => {
            try {
                return GM_openInTab(url, opts);
            } catch (e) {
                console.error('GM_openInTab failed:', e);
                return window.open(url, '_blank');
            }
        },
        download: (data, filename, type = 'text/plain') => {
            try {
                GM_download({ url: 'data:' + type + ';charset=utf-8,' + encodeURIComponent(data), name: filename });
                return true;
            } catch (e) {
                console.error('GM_download failed, using fallback:', e);
                try {
                    const blob = new Blob([data], { type: type + ';charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 100);
                    return true;
                } catch (fallbackError) {
                    console.error('Fallback download failed:', fallbackError);
                    return false;
                }
            }
        },
        request: (details) => {
            return new Promise((resolve, reject) => {
                try {
                    GM_xmlhttpRequest({
                        ...details,
                        onload: (response) => resolve(response),
                        onerror: (error) => reject(error),
                        ontimeout: () => reject(new Error('Request timed out'))
                    });
                } catch (e) {
                    console.error('GM_xmlhttpRequest failed:', e);
                    reject(e);
                }
            });
        }
    };
    // Enhanced settings management
    function saveSettings() {
        const iframe = document.querySelector('#la-ui-frame');
        if (!iframe?.contentDocument) return null;
        const doc = iframe.contentDocument;
        const settings = {
            globalScrollSteps: parseInt(doc.querySelector('#la-global-scroll-steps')?.value) || CONFIG.DEFAULTS.GLOBAL_SCROLL_STEPS,
            lastn: parseInt(doc.querySelector('#la-lastn')?.value) || CONFIG.DEFAULTS.LAST_N,
            maxrs: parseInt(doc.querySelector('#la-maxrs')?.value) || CONFIG.DEFAULTS.MAX_RS,
            scrollDelay: parseInt(doc.querySelector('#la-scroll-delay')?.value) || CONFIG.DEFAULTS.SCROLL_DELAY,
            batchSize: parseInt(doc.querySelector('#la-batch-size')?.value) || CONFIG.DEFAULTS.BATCH_SIZE,
            profileWaitDelay: parseInt(doc.querySelector('#la-profile-wait-delay')?.value) || CONFIG.DEFAULTS.PROFILE_WAIT_DELAY,
            popupLimit: parseInt(doc.querySelector('#la-popup-limit')?.value) || CONFIG.DEFAULTS.POPUP_LIMIT,
            popupScrollDelay: parseInt(doc.querySelector('#la-popup-scroll-delay')?.value) || CONFIG.DEFAULTS.POPUP_SCROLL_DELAY,
            commentLimit: parseInt(doc.querySelector('#la-comment-limit')?.value) || CONFIG.DEFAULTS.COMMENT_LIMIT,
            commentDelay: parseInt(doc.querySelector('#la-comment-delay')?.value) || CONFIG.DEFAULTS.COMMENT_DELAY,
            batchMode: doc.querySelector('#la-batch-mode')?.checked || false,
            executionMode: doc.querySelector('#la-execution-mode')?.value || CONFIG.DEFAULTS.EXECUTION_MODE
        };
        const botSettings = {
            apiKey: doc.querySelector('#la-bot-api-key')?.value || '',
            model: doc.querySelector('#la-bot-model-list')?.value || '',
            prompt: doc.querySelector('#la-bot-prompt')?.value || '',
            params: {
                top_k: parseFloat(doc.querySelector('#la-bot-param-top_k')?.value) || CONFIG.BOT.DEFAULT_PARAMS.top_k,
                top_p: parseFloat(doc.querySelector('#la-bot-param-top_p')?.value) || CONFIG.BOT.DEFAULT_PARAMS.top_p,
                max_tokens: parseInt(doc.querySelector('#la-bot-param-max_tokens')?.value) || CONFIG.BOT.DEFAULT_PARAMS.max_tokens,
                temperature: parseFloat(doc.querySelector('#la-bot-param-temperature')?.value) || CONFIG.BOT.DEFAULT_PARAMS.temperature,
                presence_penalty: parseFloat(doc.querySelector('#la-bot-param-presence_penalty')?.value) || CONFIG.BOT.DEFAULT_PARAMS.presence_penalty,
                frequency_penalty: parseFloat(doc.querySelector('#la-bot-param-frequency_penalty')?.value) || CONFIG.BOT.DEFAULT_PARAMS.frequency_penalty,
            }
        };

        gm.setValue('la_settings', JSON.stringify(settings));
        gm.setValue('la_bot_settings', JSON.stringify(botSettings));

        saveToHistory({ timestamp: Date.now(), action: 'settings_saved', settings: { ...settings, bot: botSettings } });

        return { ...settings, bot: botSettings };
    }
    function loadSettings() {
        try {
            const saved = gm.getValue('la_settings', null);
            const savedBot = gm.getValue('la_bot_settings', null);
            let settings = null;
            if (saved) settings = JSON.parse(saved);
            if (savedBot) {
                if (!settings) settings = {};
                settings.bot = JSON.parse(savedBot);
            }
            return settings;
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        return null;
    }
    function applySettings(settings) {
        if (!settings) return;
        const iframe = document.querySelector('#la-ui-frame');
        if (!iframe?.contentDocument) return;
        const doc = iframe.contentDocument;
        const inputs = {
            '#la-global-scroll-steps': settings.globalScrollSteps,
            '#la-lastn': settings.lastn,
            '#la-maxrs': settings.maxrs,
            '#la-scroll-delay': settings.scrollDelay,
            '#la-batch-size': settings.batchSize,
            '#la-profile-wait-delay': settings.profileWaitDelay,
            '#la-popup-limit': settings.popupLimit,
            '#la-popup-scroll-delay': settings.popupScrollDelay,
            '#la-comment-limit': settings.commentLimit,
            '#la-comment-delay': settings.commentDelay,
            '#la-execution-mode': settings.executionMode
        };
        for (const [selector, value] of Object.entries(inputs)) {
            const input = doc.querySelector(selector);
            if (input && value !== undefined) input.value = value;
        }
        const batchCheckbox = doc.querySelector('#la-batch-mode');
        if (batchCheckbox) batchCheckbox.checked = settings.batchMode || false;
        if (settings.bot) {
            doc.querySelector('#la-bot-api-key').value = settings.bot.apiKey || '';
            doc.querySelector('#la-bot-prompt').value = settings.bot.prompt || 'Lütfen şu tweete yanıt ver: {tweet}';
            if (settings.bot.model) {
                const modelOption = doc.createElement('option');
                modelOption.value = settings.bot.model;
                modelOption.textContent = settings.bot.model;
                doc.querySelector('#la-bot-model-list').appendChild(modelOption);
                doc.querySelector('#la-bot-model-list').value = settings.bot.model;
            }
            if (settings.bot.params) {
                for (const [param, value] of Object.entries(settings.bot.params)) {
                    const slider = doc.querySelector(`#la-bot-param-${param}`);
                    const numberInput = doc.querySelector(`#la-bot-param-value-${param}`);
                    if (slider) slider.value = value;
                    if (numberInput) numberInput.value = value;
                }
            }
        }
    }
    // Analysis history management
    function saveToHistory(entry) {
        try {
            const history = gm.getValue('la_analysis_history', '[]');
            const historyArray = JSON.parse(history);
            // Keep only last 100 entries to prevent excessive storage
            while (historyArray.length >= 100) {
                historyArray.shift();
            }
            historyArray.push(entry);
            gm.setValue('la_analysis_history', JSON.stringify(historyArray));
        } catch (e) {
            console.error('Failed to save to history:', e);
        }
    }
    function loadAnalysisHistory() {
        try {
            const history = gm.getValue('la_analysis_history', '[]');
            return JSON.parse(history);
        } catch (e) {
            console.error('Failed to load analysis history:', e);
            return [];
        }
    }
    // Global script state management
    function updateGlobalScriptState() {
        gm.setValue('la_analysis_paused', ANALYSIS_PAUSED);
        gm.setValue('la_analysis_running', ANALYSIS_RUNNING || VIEWS_ANALYSIS_RUNNING || USER_SCRAPING_RUNNING || COMMENT_BOT_RUNNING);
        gm.setValue('la_analysis_cancelled', ANALYSIS_CANCELLED);
    }
    function getGlobalScriptState() {
        return {
            paused: gm.getValue('la_analysis_paused', false),
            running: gm.getValue('la_analysis_running', false),
            cancelled: gm.getValue('la_analysis_cancelled', false)
        };
    }
    // Enhanced verification detection with fallbacks
    function hasVerificationCheckmark(userElement) {
        // Try all verification selectors
        for (const selectorType of Object.values(SELECTORS.VERIFICATION)) {
            if (findElement(selectorType, userElement)) {
                return true;
            }
        }
        // Fallback: Check for common verification indicators in SVG paths
        const svgElements = userElement.querySelectorAll('svg');
        for (const svg of svgElements) {
            const path = svg.querySelector('path');
            if (path) {
                const d = path.getAttribute('d') || '';
                const verificationPaths = [
                    'M22.25 12c0-1.43-.88-2.67-2.19-3.34',
                    'M9 16.17',
                    'checkmark',
                    'verified'
                ];
                if (verificationPaths.some(vPath => d.includes(vPath))) {
                    return true;
                }
            }
            // Check fill colors for verified badges
            const fill = svg.getAttribute('fill') || '';
            if (['#1d9bf0', '#ffd700', '#f7931e'].includes(fill)) {
                return true;
            }
        }
        return false;
    }
    // Enhanced comment count extraction with fallbacks
    function extractCommentCountFromTweet(tweetElement) {
        try {
            // Try primary selector first
            const primarySelectors = SELECTORS.TWEET.REPLY_COUNT;
            for (const selector of primarySelectors) {
                const element = findElement([selector], tweetElement);
                if (element) {
                    const text = element.textContent.trim();
                    if (text && /^\d+/.test(text)) {
                        const number = parseInt(text.replace(/[^\d]/g, '')) || 0;
                        return number;
                    }
                }
            }
            // Fallback selectors
            const fallbackSelectors = [
                'div[role="group"] button:first-child span',
                'button svg + span',
                'button[aria-label*="yanıt"] span'
            ];
            for (const selector of fallbackSelectors) {
                const element = findElement([selector], tweetElement);
                if (element) {
                    const text = element.textContent.trim();
                    if (text && /^\d+/.test(text)) {
                        const number = parseInt(text.replace(/[^\d]/g, '')) || 0;
                        return number;
                    }
                }
            }
            return 0;
        } catch (error) {
            console.error('Error extracting comment count:', error);
            return 0;
        }
    }
    function ensureFab() {
        let fab = document.getElementById('la-fab');
        if (!fab) {
            fab = document.createElement('button');
            fab.id = 'la-fab';
            fab.type = 'button';
            fab.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
            Object.assign(fab.style, {
                position: 'fixed', top: '16px', right: '16px',
                zIndex: '2147483647', background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                border: 'none', borderRadius: '12px',
                width: '48px', height: '48px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            });
            fab.addEventListener('mouseenter', () => {
                fab.style.transform = 'scale(1.05)';
                fab.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
            });
            fab.addEventListener('mouseleave', () => {
                fab.style.transform = 'scale(1)';
                fab.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            });
            fab.addEventListener('click', togglePanelVisible);
            document.documentElement.appendChild(fab);
        }
        return fab;
    }
    function ensurePanelIframe() {
        let fr = document.getElementById('la-ui-frame');
        if (!fr) {
            fr = document.createElement('iframe');
            fr.id = 'la-ui-frame';
            fr.setAttribute('title', 'Liste Analiz Aracı');
            fr.setAttribute('aria-label', 'Liste Analiz Aracı');
            Object.assign(fr.style, {
                position: 'fixed', top: '72px', right: '16px',
                width: '850px', /* Increased width for side menu */
                height: '720px',
                zIndex: '2147483647', border: 'none', borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'none',
                background: 'transparent', transition: 'all 0.3s ease'
            });
            document.documentElement.appendChild(fr);
            buildIframeUI(fr);
        }
        return fr;
    }
    function togglePanelVisible() {
        const fr = ensurePanelIframe();
        fr.style.display = fr.style.display === 'none' ? 'block' : 'none';
    }
    function buildIframeUI(fr) {
        const doc = fr.contentDocument;
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <style>
        :root {
            --bg-primary: #111827;
            --bg-secondary: #1f2937;
            --bg-tertiary: #374151;
            --text-primary: #f9fafb;
            --text-secondary: #9ca3af;
            --accent-primary: #3b82f6;
            --accent-secondary: #10b981;
            --accent-danger: #ef4444;
            --accent-warning: #f59e0b;
            --border-color: #4b5563;
            --border-radius: 8px;
            --font-family: 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            --transition-fast: all 0.2s ease-in-out;
            --menu-width: 200px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: var(--font-family); background: transparent; color: var(--text-primary); overflow: hidden; font-size: 14px; }
        .panel { width: 100%; height: 100%; border-radius: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); display: flex; flex-direction: row; align-items: stretch; max-height: 720px; }
        .sidebar { width: var(--menu-width); background: var(--bg-secondary); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; flex-shrink: 0; padding: 12px; }
        .menu-title { font-size: 18px; font-weight: 600; padding: 8px 4px 16px 4px; display: flex; align-items: center; gap: 8px; }
        .menu-title .badge { font-size: 10px; }
        .menu-tabs { display: flex; flex-direction: column; gap: 4px; }
        .menu-tabs button { width: 100%; display: flex; align-items: center; justify-content: flex-start; gap: 10px; background: none; border: none; color: var(--text-secondary); font-size: 13px; font-weight: 500; padding: 10px; cursor: pointer; border-radius: 6px; transition: var(--transition-fast); }
        .menu-tabs button:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .menu-tabs button.active { background: var(--accent-primary); color: white; }
        .menu-tabs button svg { width: 16px; height: 16px; flex-shrink: 0; }
        .content-wrapper { flex-grow: 1; display: flex; flex-direction: column; min-width: 0; }
        header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
        .menu-controls { display: flex; gap: 8px; align-items: center; }
        .menu-controls button { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 8px 12px; cursor: pointer; border-radius: 6px; transition: var(--transition-fast); border: 1px solid transparent; }
        .updates { background: var(--accent-secondary); color: white; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 500; cursor: pointer; transition: var(--transition-fast); margin-left: auto; }
        .updates:hover { filter: brightness(1.2); }
        .close-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: var(--transition-fast); margin-left: 12px; }
        .close-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }
        .btn { background: var(--bg-tertiary); color: var(--text-primary); border-color: var(--border-color); }
        .btn:hover:not(:disabled) { background: var(--accent-primary); border-color: var(--accent-primary); color: white; }
        .btn-primary { background: var(--accent-primary); color: white; }
        .btn-primary:hover:not(:disabled) { filter: brightness(1.2); }
        .btn-danger { background: var(--accent-danger); color: white; }
        .btn-danger:hover:not(:disabled) { filter: brightness(1.2); }
        .btn-success { background: var(--accent-secondary); color: white; }
        .btn-success:hover:not(:disabled) { filter: brightness(1.2); }
        .btn-warning { background: var(--accent-warning); color: var(--bg-primary); }
        .btn-warning:hover:not(:disabled) { filter: brightness(1.2); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .main { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .body { flex: 1; overflow-y: auto; padding: 16px; min-height: 0; }
        .body::-webkit-scrollbar { width: 6px; }
        .body::-webkit-scrollbar-thumb { background: var(--bg-tertiary); border-radius: 3px; }
        .body::-webkit-scrollbar-track { background: var(--bg-secondary); }
        .tab-content { display: none; }
        .tab-content.active { display: flex; flex-direction: column; gap: 16px; height: 100%; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
        .form-group.row { flex-direction: row; align-items: center; gap: 8px; }
        .form-group.row input[type="text"], .form-group.row button { flex: 1; }
        .category-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border-color); }
        label { font-size: 12px; font-weight: 500; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; }
        .label-info { font-size: 11px; color: var(--text-secondary); opacity: 0.8; }
        input[type="number"], input[type="text"], input[type="password"], textarea, select { width: 100%; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; font-size: 13px; outline: none; transition: var(--transition-fast); }
        input:focus, textarea:focus, select:focus { border-color: var(--accent-primary); background-color: var(--bg-primary); }
        textarea { min-height: 120px; resize: vertical; font-family: var(--font-family); }
        .checkbox-row { display: flex; align-items: center; gap: 8px; }
        .checkbox-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent-primary); }
        .checkbox-row label { font-size: 13px; color: var(--text-primary); font-weight: normal; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
        .param-slider { display: flex; align-items: center; gap: 12px; }
        .param-slider input[type="range"] { flex-grow: 1; }
        .param-slider input[type="number"] { width: 70px; text-align: center; }
        .progress-bar { height: 6px; background: var(--bg-secondary); border-radius: 999px; overflow: hidden; }
        .progress-bar > div { height: 100%; background: var(--accent-primary); transition: width 0.3s ease; border-radius: 999px; }
        .detailed-progress { background: var(--bg-secondary); border-radius: var(--border-radius); padding: 12px; font-size: 12px; line-height: 1.6; }
        .detailed-progress strong { color: var(--accent-primary); }
        .results-container { display: flex; flex-direction: column; gap: 8px; }
        .table-wrapper { overflow-x: auto; border: 1px solid var(--border-color); border-radius: var(--border-radius); }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead th { position: sticky; top: 0; background: var(--bg-secondary); padding: 10px 12px; border-bottom: 1px solid var(--border-color); text-align: left; font-weight: 600; white-space: nowrap; }
        tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:hover { background-color: var(--bg-tertiary); }
        .status { font-size: 12px; font-weight: 500; }
        .success { color: var(--accent-secondary); }
        .error { color: var(--accent-danger); }
        .warning { color: var(--accent-warning); }
        .tooltip { position: relative; }
        .tooltip .tooltiptext { visibility: hidden; width: max-content; max-width: 200px; background-color: var(--bg-tertiary); color: var(--text-primary); text-align: center; border-radius: 6px; padding: 6px 10px; position: absolute; z-index: 1; bottom: 125%; left: 50%; transform: translateX(-50%); opacity: 0; transition: opacity 0.3s; font-size: 11px; pointer-events: none; }
        .tooltip:hover .tooltiptext { visibility: visible; opacity: 1; }
        .info-box { background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: var(--border-radius); padding: 12px; font-size: 12px; line-height: 1.5; }
        .rate-limit-warning { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: var(--border-radius); padding: 12px; font-size: 12px; color: var(--accent-warning); }
        .export-options { display: flex; gap: 8px; flex-wrap: wrap; }
        .export-options button { flex: 1; min-width: 80px; padding: 8px; font-size: 12px; border: none; border-radius: 6px; cursor: pointer; transition: var(--transition-fast); color: white; }
        .radio-group { display: flex; align-items: center; gap: 16px; background-color: var(--bg-secondary); padding: 8px; border-radius: var(--border-radius); }
        .radio-option { display: flex; align-items: center; gap: 6px; }
        .radio-option input[type="radio"] { accent-color: var(--accent-primary); width: 16px; height: 16px; }
        .radio-option label { font-size: 13px; color: var(--text-primary); font-weight: 500; cursor: pointer; }
    </style>
</head>
<body>
    <div class="panel">
        <div class="sidebar">
            <div class="menu-title">Analiz Aracı <span class="badge">PRO</span></div>
            <div class="menu-tabs">
                <button id="la-tab-analysis" class="active"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13v10l7-5-7-5z"/></svg>Yanıt Analizi</button>
                <button id="la-tab-views"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>Görüntülenme</button>
                <button id="la-tab-comment-bot"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9.45 11.55L8.2 10.3l-1.25 1.25L9.45 14l3.55-3.55L11.75 9.2 9.45 11.55zm5.1-1.1L13.3 9.2l-1.25 1.25 1.25 1.25 1.25-1.25zm0-3.15L13.3 6.05 12.05 7.3l1.25 1.25 1.25-1.25z"/></svg>Yorum Botu</button>
                <button id="la-tab-user-scraping"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>Kullanıcı Çekme</button>
                <button id="la-tab-history"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6l5.25 3.15-.75 1.23L11 13V7z"/></svg>Geçmiş</button>
                <button id="la-tab-settings"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69-.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12-.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69-.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>Ayarlar</button>
            </div>
        </div>
        <div class="content-wrapper">
            <header>
                 <div class="menu-controls">
                    <button id="la-start" class="btn-primary"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Başlat</button>
                    <button id="la-stop" class="btn-danger" style="display:none;"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>Durdur</button>
                    <button id="la-pause-resume" class="btn-warning" disabled><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Duraklat</button>
                    <button id="la-save-settings" class="btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>Kaydet</button>
                    <button id="la-clear" class="btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>Temizle</button>
                    <button id="la-export" class="btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>İndir</button>
                </div>
                <span class="updates" title="Liste üyeleri (popup) çekme işlemi onarıldı ve seçiciler güncellendi.">Güncellemeler (v10.2.0)</span>
                <button class="close-btn" id="la-close" title="Paneli Kapat">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </header>
            <div class="main">
                <div class="body">
                    <!-- Yanıt Analizi Sekmesi -->
                    <div id="tab-analysis" class="tab-content active">
                        <div class="form-group">
                            <label for="la-usernames">Kullanıcı Adları (@ hariç, her satıra bir tane)</label>
                            <textarea id="la-usernames" placeholder="Kullanıcı adlarını buraya girin..."></textarea>
                            <div class="label-info"><span id="la-usercount">0</span> kullanıcı eklendi.</div>
                        </div>
                        <div class="form-group">
                            <div class="progress-bar"><div id="la-pb"></div></div>
                            <div class="rate-limit-warning" id="la-rate-limit-warning" style="display:none;">⚠️ Hız sınırı tespit edildi. İşlem otomatik olarak bekletilecek...</div>
                            <div class="detailed-progress" id="la-detailed-progress" style="display:none;"></div>
                            <div class="muted status" id="la-status">Hazır</div>
                        </div>
                        <div class="results-container">
                            <div class="export-options">
                                <button id="export-csv" style="background:#10b981;">CSV</button>
                                <button id="export-json" style="background:#3b82f6;">JSON</button>
                                <button id="export-xlsx" style="background:#f59e0b; color: #111827;">XLSX</button>
                                <button id="export-txt" style="background:#6b7280;">TXT</button>
                            </div>
                            <div class="table-wrapper">
                                <table id="la-results">
                                    <thead><tr><th>Kullanıcı</th><th>Kendi Yorumu</th><th>Diğer Yorumlar</th><th>Profil Yorum Tpl.</th><th>Reply Guys %</th><th>Durum</th></tr></thead>
                                    <tbody></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <!-- Görüntülenme Analizi Sekmesi -->
                    <div id="tab-views" class="tab-content">
                        <div class="info-box">Bu araç, girilen kullanıcıların son tweet'lerini analiz ederek ortalama görüntülenme performanslarını ve potansiyellerini hesaplar.</div>
                        <div class="form-group">
                            <label for="la-views-usernames">Kullanıcı Adları (@ hariç)</label>
                            <textarea id="la-views-usernames" placeholder="Kullanıcı adlarını buraya girin..."></textarea>
                            <div class="label-info"><span id="la-views-usercount">0</span> kullanıcı eklendi.</div>
                        </div>
                        <div class="form-group grid">
                            <div class="tooltip"><label>Tweet Sayısı</label><input type="number" id="la-views-tweet-count" value="5"/><span class="tooltiptext">Her kullanıcıdan analiz edilecek tweet sayısı.</span></div>
                            <div class="tooltip"><label>Top Tweet</label><input type="number" id="la-views-top-count" value="${CONFIG.DEFAULTS.TOP_TWEETS}"/><span class="tooltiptext">En yüksek görüntülenmeli kaç tweetin toplanacağı.</span></div>
                            <div class="tooltip"><label>Min. Görüntülenme</label><input type="number" id="la-views-min-threshold" value="${CONFIG.DEFAULTS.MIN_VIEW_THRESHOLD}"/><span class="tooltiptext">Analize dahil edilecek minimum görüntülenme sayısı.</span></div>
                        </div>
                        <div class="form-group">
                            <div class="progress-bar"><div id="la-views-pb"></div></div>
                            <div class="rate-limit-warning" id="la-views-rate-limit-warning" style="display:none;">⚠️ Hız sınırı tespit edildi. İşlem otomatik olarak bekletilecek...</div>
                            <div class="detailed-progress" id="la-views-detailed-progress" style="display:none;"></div>
                            <div class="muted status" id="la-views-status">Hazır</div>
                        </div>
                         <div class="results-container">
                            <div class="export-options">
                                <button id="views-export-csv" style="background:#10b981;">CSV</button>
                                <button id="views-export-json" style="background:#3b82f6;">JSON</button>
                                <button id="views-export-xlsx" style="background:#f59e0b; color: #111827;">XLSX</button>
                                <button id="views-export-txt" style="background:#6b7280;">TXT</button>
                            </div>
                            <div class="table-wrapper">
                                <table id="la-views-results">
                                    <thead><tr><th>Kullanıcı</th><th>Profil Gör. Toplamı</th><th>Top Tweet Gör.</th><th>YGT %</th><th>Durum</th></tr></thead>
                                    <tbody></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                     <!-- Yorum Botu Sekmesi -->
                    <div id="tab-comment-bot" class="tab-content">
                        <div class="info-box"><strong>Kullanım:</strong> Yorum botunu başlatmadan önce "Ayarlar" sekmesinden Open Router API anahtarınızı ve diğer ayarları yapılandırdığınızdan emin olun. Bot, bulunduğunuz sayfadaki tweetleri tarayacak ve belirlediğiniz zaman limitine uyanlara otomatik olarak yorum yapacaktır.</div>
                        <div class="form-group">
                             <label for="la-bot-time-limit">Tweet Yaşı Limiti (dakika)</label>
                            <input type="number" id="la-bot-time-limit" value="${CONFIG.BOT.TWEET_AGE_LIMIT_MINUTES}" />
                            <div class="label-info">Yalnızca bu süre zarfında atılmış tweetlere yorum yapılır.</div>
                        </div>
                         <div class="form-group">
                            <div class="progress-bar"><div id="la-comment_bot-pb"></div></div>
                            <div class="muted status" id="la-comment_bot-status">Hazır</div>
                        </div>
                        <div class="form-group">
                            <label for="la-bot-log">Bot Aktivite Kaydı</label>
                            <textarea id="la-bot-log" readonly style="height: 280px;"></textarea>
                        </div>
                    </div>
                    <!-- Kullanıcı Çekme Sekmesi -->
                    <div id="tab-user-scraping" class="tab-content">
                        <div class="form-group">
                            <label>Çekme Türü</label>
                            <div class="radio-group">
                                <div class="radio-option">
                                    <input type="radio" name="scrapingType" value="profile" id="scraping-type-profile" checked>
                                    <label for="scraping-type-profile">Takipçi/Takip Listesi</label>
                                </div>
                                <div class="radio-option">
                                    <input type="radio" name="scrapingType" value="popup" id="scraping-type-popup">
                                    <label for="scraping-type-popup">Liste Üyeleri (Popup)</label>
                                </div>
                                <div class="radio-option">
                                    <input type="radio" name="scrapingType" value="comments" id="scraping-type-comments">
                                    <label for="scraping-type-comments">Tweet Yorumcuları</label>
                                </div>
                            </div>
                        </div>
                        <div id="la-scraping-instructions" class="info-box"><strong>Kullanım:</strong> Bir kullanıcının "Takipçiler" veya "Takip Edilenler" sayfasına gidin. Ardından "Başlat" butonuna basın. Araç, sayfadaki <strong>doğrulanmış (mavi/sarı tikli)</strong> kullanıcıları otomatik olarak çekecektir.</div>
                        <div class="form-group">
                            <div class="progress-bar"><div id="la-user-scraping-pb"></div></div>
                            <div class="muted status" id="la-user-scraping-status">Hazır</div>
                        </div>
                        <div class="form-group">
                             <label for="la-user-scraping-results">Çekilen Doğrulanmış Kişiler (<span id="la-user-scraping-count">0</span>)</label>
                            <textarea id="la-user-scraping-results" readonly style="height: 280px;"></textarea>
                        </div>
                    </div>
                    <!-- Geçmiş Sekmesi -->
                    <div id="tab-history" class="tab-content">
                        <div class="info-box">Önceki analiz işlemlerinizin ve kaydettiğiniz ayarların kaydını burada görüntüleyebilirsiniz.</div>
                        <div class="form-group" style="flex-direction: row; gap: 8px;">
                             <button id="la-load-history" class="btn-primary" style="flex: 1;">Geçmişi Yükle</button>
                             <button id="la-clear-history" class="btn-danger" style="flex: 1;">Geçmişi Temizle</button>
                        </div>
                        <div class="form-group">
                            <label for="la-history-results">Analiz Geçmişi</label>
                            <textarea id="la-history-results" readonly style="height: 380px;"></textarea>
                        </div>
                    </div>
                    <!-- Ayarlar Sekmesi -->
                    <div id="tab-settings" class="tab-content">
                         <div class="category-title">Yorum Botu Ayarları (Open Router)</div>
                        <div class="form-group">
                             <label for="la-bot-api-key">API Anahtarı</label>
                             <div class="form-group row">
                                <input type="password" id="la-bot-api-key" placeholder="sk-or-v1-..." />
                                <button id="la-bot-fetch-models" class="btn">Modelleri Getir</button>
                             </div>
                        </div>
                        <div class="form-group">
                            <label for="la-bot-model-list">Yapay Zeka Modeli</label>
                            <select id="la-bot-model-list"><option value="">Önce modelleri getirin</option></select>
                        </div>
                        <div class="form-group">
                            <label for="la-bot-prompt">Prompt Şablonu ({tweet} değişkenini kullanın)</label>
                            <textarea id="la-bot-prompt" placeholder="Lütfen şu tweete yanıt ver: {tweet}"></textarea>
                        </div>
                        <div class="form-group grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
                            ${Object.entries(CONFIG.BOT.DEFAULT_PARAMS).map(([param, value]) => `
                                <div class="form-group">
                                    <label for="la-bot-param-${param}">${param.replace(/_/g, ' ')}</label>
                                    <div class="param-slider">
                                        <input type="range" id="la-bot-param-${param}" min="${param === 'max_tokens' ? 10 : 0}" max="${param === 'max_tokens' ? 2048 : (param === 'temperature' ? 2 : 1)}" step="${param.includes('penalty') || param.includes('temperature') || param.includes('top_p') ? 0.01 : 1}" value="${value}" />
                                        <input type="number" id="la-bot-param-value-${param}" value="${value}" step="${param.includes('penalty') || param.includes('temperature') || param.includes('top_p') ? 0.01 : 1}" />
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="category-title" style="margin-top: 16px;">Genel Analiz İşlemleri</div>
                        <div class="form-group grid">
                            <div class="tooltip">
                                <label for="la-lastn">Tweet Sayısı</label>
                                <input type="number" id="la-lastn" value="5"/>
                                <span class="tooltiptext">Analiz edilecek son orijinal tweet sayısı.</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-maxrs">Detay Scroll</label>
                                <input type="number" id="la-maxrs" value="${CONFIG.DEFAULTS.MAX_RS}"/>
                                <span class="tooltiptext">Yorumları toplarken yapılacak maksimum kaydırma sayısı.</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-scroll-delay">Scroll Gecikmesi</label>
                                <input type="number" id="la-scroll-delay" value="${CONFIG.DEFAULTS.SCROLL_DELAY}"/>
                                <span class="tooltiptext">Her kaydırma arasındaki bekleme süresi (ms).</span>
                            </div>
                             <div class="tooltip">
                                <label for="la-global-scroll-steps">Global Scroll</label>
                                <input type="number" id="la-global-scroll-steps" value="${CONFIG.DEFAULTS.GLOBAL_SCROLL_STEPS}"/>
                                <span class="tooltiptext">Profil ve liste sayfalarında kaydırma adımı.</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-batch-size">Batch Boyutu</label>
                                <input type="number" id="la-batch-size" value="${CONFIG.DEFAULTS.BATCH_SIZE}"/>
                                <span class="tooltiptext">Batch modunda aynı anda işlenecek kullanıcı sayısı.</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-profile-wait-delay">Profil Arası Bekleme (sn)</label>
                                <input type="number" id="la-profile-wait-delay" value="${CONFIG.DEFAULTS.PROFILE_WAIT_DELAY}"/>
                                <span class="tooltiptext">Her profil analizi arasındaki bekleme süresi (saniye).</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-execution-mode">Çalışma Modu</label>
                                <select id="la-execution-mode">
                                    <option value="background">Arkaplanda (Önerilen)</option>
                                    <option value="window">Yeni Pencerede</option>
                                    <option value="tab">Aktif Sekmede</option>
                                </select>
                                <span class="tooltiptext">Analizlerin nasıl çalıştırılacağını seçin. Arkaplan modu, tarayıcı yavaşlatmalarını en aza indirir.</span>
                            </div>
                        </div>
                        <div class="category-title" style="margin-top: 16px;">Kullanıcı Çekme İşlemleri</div>
                        <div class="form-group grid">
                            <div class="tooltip">
                                <label for="la-popup-limit">Adet Limiti (0=sınırsız)</label>
                                <input type="number" id="la-popup-limit" value="0"/>
                                <span class="tooltiptext">Liste/Takipçi çekmede maksimum kullanıcı sayısı.</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-popup-scroll-delay">Scroll Gecikmesi (ms)</label>
                                <input type="number" id="la-popup-scroll-delay" value="${CONFIG.DEFAULTS.POPUP_SCROLL_DELAY}"/>
                                <span class="tooltiptext">Liste/Takipçi çekmede kaydırma arasındaki bekleme süresi.</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-comment-limit">Adet Limiti (0=sınırsız)</label>
                                <input type="number" id="la-comment-limit" value="0"/>
                                <span class="tooltiptext">Yorum çekmede maksimum yorumcu sayısı.</span>
                            </div>
                            <div class="tooltip">
                                <label for="la-comment-delay">Scroll Gecikmesi (ms)</label>
                                <input type="number" id="la-comment-delay" value="${CONFIG.DEFAULTS.COMMENT_DELAY}"/>
                                <span class="tooltiptext">Yorum çekmede kaydırma arasındaki bekleme süresi.</span>
                            </div>
                        </div>
                         <div class="muted status" id="la-settings-status" style="margin-top:16px;">Hazır</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
        doc.open();
        doc.write(html);
        doc.close();
        attachIframeHandlers(fr);
    }
    function attachIframeHandlers(fr) {
        const doc = fr.contentDocument;
        const q = (sel) => doc.querySelector(sel);
        // Tab switching
        const tabs = ['analysis', 'views', 'comment-bot', 'user-scraping', 'history', 'settings'];
        tabs.forEach(tab => {
            q(`#la-tab-${tab}`)?.addEventListener('click', () => {
                tabs.forEach(t => {
                    q(`#la-tab-${t}`)?.classList.toggle('active', t === tab);
                    q(`#tab-${t}`)?.classList.toggle('active', t === tab);
                });
            });
        });
        // Enhanced status and progress functions
        const setStatus = debounce((m, type = 'info', prefix = 'la') => {
            const el = q(`#${prefix}-status`);
            if (el) {
                el.textContent = m || currentLang.READY;
                el.className = `muted status ${type}`;
            }
        }, CONFIG.UI.DEBOUNCE_DELAY);
        const setProgress = debounce((p, prefix = 'la') => {
            const progressEl = q(`#${prefix}-pb`);
            if (progressEl) {
                progressEl.style.width = `${Math.max(0, Math.min(100, p))}%`;
            }
        }, CONFIG.UI.DEBOUNCE_DELAY);
        const setDetailedProgress = (currentUser, currentIndex, totalUsers, currentStep = '', prefix = 'la') => {
            const detailedEl = q(`#${prefix}-detailed-progress`);
            if (detailedEl) {
                detailedEl.style.display = 'block';
                detailedEl.innerHTML = `
                    <strong>İşleniyor:</strong> @${escapeHtml(currentUser)} (${currentIndex}/${totalUsers})<br>
                    <strong>Adım:</strong> ${escapeHtml(currentStep)}<br>
                    <strong>İlerleme:</strong> %${Math.round((currentIndex / totalUsers) * 100)}
                `;
            }
        };
        const showRateLimitWarning = (show = true, prefix = 'la') => {
            const warningEl = q(`#${prefix}-rate-limit-warning`);
            if (warningEl) {
                warningEl.style.display = show ? 'block' : 'none';
            }
        };
        // Enhanced username parsing with validation
        const parseUsernames = (t) => {
            if (!t) return [];
            const usernames = t.split(/\r?\n/)
                .map(s => sanitizeInput(s.replace(/^@/, '')))
                .filter(Boolean)
                .map(validateUsername)
                .filter(Boolean);
            // Remove duplicates
            return [...new Set(usernames)];
        };
        const refreshCount = debounce(() => {
            const count = parseUsernames(q('#la-usernames')?.value || '').length;
            const countEl = q('#la-usercount');
            if (countEl) {
                countEl.textContent = String(count);
                // Show batch mode suggestion for large lists
                const batchCheckbox = q('#la-batch-mode');
                const batchSizeInput = q('#la-batch-size');
                if (count > CONFIG.LIMITS.MAX_USER_LIST_SIZE && batchCheckbox && batchSizeInput) {
                    batchCheckbox.checked = true;
                }
            }
        }, CONFIG.UI.PROGRESS_UPDATE_INTERVAL);
        const refreshViewsCount = debounce(() => {
            const count = parseUsernames(q('#la-views-usernames')?.value || '').length;
            const countEl = q('#la-views-usercount');
            if (countEl) {
                countEl.textContent = String(count);
            }
        }, CONFIG.UI.PROGRESS_UPDATE_INTERVAL);
        const updateUILanguage = () => {
            // Update button texts and labels based on current language
            const elements = {
                '#la-start': currentLang.START,
                '#la-pause-resume': ANALYSIS_PAUSED ? currentLang.RESUME : currentLang.PAUSE,
                '#la-stop': currentLang.STOP,
                '#la-clear': currentLang.CLEAR,
                '#la-export': currentLang.DOWNLOAD,
                '#la-save-settings': currentLang.SAVE
            };
            for (const [selector, text] of Object.entries(elements)) {
                const el = q(selector);
                if (el) {
                    const textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        textNode.textContent = ` ${text}`; // Add space for icon
                    }
                }
            }
        };
        // Enhanced pause/resume system
        function togglePauseResume() {
            const pauseBtn = q('#la-pause-resume');
            if (!pauseBtn) return;
            const isAnyAnalysisRunning = ANALYSIS_RUNNING || VIEWS_ANALYSIS_RUNNING || USER_SCRAPING_RUNNING || COMMENT_BOT_RUNNING;
            if (!isAnyAnalysisRunning) {
                const activeTabId = q('.tab-content.active')?.id.replace('tab-', '');
                setStatus('Önce bir işlem başlatın.', 'error', `la-${activeTabId.replace('-','_')}`);
                return;
            }
            if (ANALYSIS_PAUSED) {
                ANALYSIS_PAUSED = false;
                pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Duraklat';
                pauseBtn.className = 'btn-warning';
                // Find active tab and update status
                const activeTabId = q('.tab-content.active')?.id.replace('tab-', '');
                setStatus('İşlem devam ediyor...', 'success', `la-${activeTabId.replace('-','_')}`);
            } else {
                ANALYSIS_PAUSED = true;
                pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Devam Et';
                pauseBtn.className = 'btn-success';
                const activeTabId = q('.tab-content.active')?.id.replace('tab-', '');
                setStatus('İşlem duraklatıldı.', 'warning', `la-${activeTabId.replace('-','_')}`);
            }
            updateGlobalScriptState();
        }
        // Stop analysis function
        function stopAnalysis() {
            ANALYSIS_CANCELLED = true;
            ANALYSIS_RUNNING = false;
            ANALYSIS_PAUSED = false;
            VIEWS_ANALYSIS_RUNNING = false;
            USER_SCRAPING_RUNNING = false;
            COMMENT_BOT_RUNNING = false;
            // Clean up resources immediately
            cleanupResources();
            updateGlobalScriptState();
            updateControlButtons();
            // Reset all statuses
            tabs.forEach(tab => {
                 const prefix = tab.replace(/-/g, '_');
                setStatus(currentLang.CANCELLED, 'warning', `la-${prefix}`);
                setProgress(0, `la-${prefix}`);
                const detailedEl = q(`#la-${prefix}-detailed-progress`);
                if(detailedEl) detailedEl.style.display = 'none';
            });
        }
        // Enhanced control button updates
        function updateControlButtons() {
            const pauseBtn = q('#la-pause-resume');
            const startBtn = q('#la-start');
            const stopBtn = q('#la-stop');
            if (!pauseBtn || !startBtn || !stopBtn) return;
            const isAnyAnalysisRunning = ANALYSIS_RUNNING || VIEWS_ANALYSIS_RUNNING || USER_SCRAPING_RUNNING || COMMENT_BOT_RUNNING;
            if (!isAnyAnalysisRunning) {
                pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Duraklat';
                pauseBtn.className = 'btn-warning';
                pauseBtn.disabled = true;
                startBtn.style.display = 'flex';
                stopBtn.style.display = 'none';
                startBtn.disabled = false;
            } else {
                pauseBtn.disabled = false;
                startBtn.disabled = true;
                startBtn.style.display = 'none';
                stopBtn.style.display = 'flex';
                if (ANALYSIS_PAUSED) {
                    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Devam Et';
                    pauseBtn.className = 'btn-success';
                } else {
                    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>Duraklat';
                    pauseBtn.className = 'btn-warning';
                }
            }
        }
        // Enhanced settings save
        function handleSaveSettings() {
            const settings = saveSettings();
            if (!settings) {
                 setStatus('Ayarlar kaydedilemedi', 'error', 'la-settings');
                return;
            }
            const saveBtn = q('#la-save-settings');
            if (saveBtn) {
                const originalHTML = saveBtn.innerHTML;
                saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Kaydedildi';
                saveBtn.classList.add('btn-success');
                setTimeout(() => {
                    saveBtn.innerHTML = originalHTML;
                    saveBtn.classList.remove('btn-success');
                    saveBtn.classList.remove('btn');
                }, CONFIG.UI.STATUS_DISPLAY_TIME);
            }
            setStatus('Ayarlar başarıyla kaydedildi.', 'success', 'la-settings');
        }
        // History management
        function loadHistoryData() {
            const history = loadAnalysisHistory();
            const historyEl = q('#la-history-results');
            if (historyEl && history.length > 0) {
                const historyText = history.map(entry => {
                    const date = new Date(entry.timestamp).toLocaleString();
                    return `[${date}] ${entry.action}: ${JSON.stringify(entry, null, 2)}`;
                }).join('\n\n');
                historyEl.value = historyText;
                 setStatus(`${history.length} geçmiş kaydı yüklendi.`, 'success', 'la-history');
            } else if (historyEl) {
                historyEl.value = 'Henüz analiz geçmişi bulunmuyor.';
                setStatus('Geçmiş bulunamadı.', 'warning', 'la-history');
            }
        }
        function clearHistory() {
            if (confirm('Tüm analiz geçmişi silinecek. Emin misiniz?')) {
                gm.setValue('la_analysis_history', '[]');
                const historyEl = q('#la-history-results');
                if (historyEl) historyEl.value = 'Geçmiş temizlendi.';
                setStatus('Geçmiş temizlendi.', 'success', 'la-history');
            }
        }
        // Enhanced export functionality
        const exportAnalysisData = (format) => {
            const list = parseUsernames(q('#la-usernames')?.value || '');
            if (!list.length) {
                setStatus('Listede kullanıcı yok.', 'error', 'la');
                return;
            }
            const rows = Array.from(q('#la-results tbody')?.querySelectorAll('tr') || []);
            const timestamp = Date.now();
            let filename, data, mimeType;
            if (!rows.length) {
                // Export usernames only
                switch (format) {
                    case 'json':
                        data = JSON.stringify({ users: list, exported: new Date().toISOString() }, null, 2);
                        filename = `kullanicilar-${timestamp}.json`;
                        mimeType = 'application/json';
                        break;
                    case 'csv':
                        data = 'Kullanıcı\n' + list.join('\n');
                        filename = `kullanicilar-${timestamp}.csv`;
                        mimeType = 'text/csv';
                        break;
                    default:
                        data = list.join('\n');
                        filename = `kullanicilar-${timestamp}.txt`;
                        mimeType = 'text/plain';
                }
            } else {
                // Export analysis results
                const results = [];
                for (const tr of rows) {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length >= 6) {
                        results.push({
                            username: tds[0].textContent.replace(/^@/, ''),
                            ownerComments: tds[1].textContent.trim(),
                            otherComments: tds[2].textContent.trim(),
                            profileCommentTotal: tds[3].textContent.trim(),
                            replyGuysPercentage: tds[4].textContent.trim(),
                            status: tds[5].textContent.trim()
                        });
                    }
                }
                switch (format) {
                    case 'json':
                        data = JSON.stringify({
                            results,
                            totalUsers: results.length,
                            exported: new Date().toISOString(),
                            metadata: {
                                version: '10.2.0',
                                type: 'reply_analysis'
                            }
                        }, null, 2);
                        filename = `analiz-raporu-${timestamp}.json`;
                        mimeType = 'application/json';
                        break;
                    case 'xlsx':
                        // Simple XLSX-like format (CSV with .xlsx extension)
                        data = 'Kullanıcı,Tweet Sahibinin Yorumları,Diğer Kullanıcıların Yorumları,Profil Yorum Toplamı,Reply Guys %,Durum\n';
                        for (const result of results) {
                            data += `${csvEscape(result.username)},${csvEscape(result.ownerComments)},${csvEscape(result.otherComments)},${csvEscape(result.profileCommentTotal)},${csvEscape(result.replyGuysPercentage)},${csvEscape(result.status)}\n`;
                        }
                        filename = `analiz-raporu-${timestamp}.xlsx`;
                        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                        break;
                    case 'csv':
                        data = 'Kullanıcı,Tweet Sahibinin Yorumları,Diğer Kullanıcıların Yorumları,Profil Yorum Toplamı,Reply Guys %,Durum\n';
                        for (const result of results) {
                            data += `${csvEscape(result.username)},${csvEscape(result.ownerComments)},${csvEscape(result.otherComments)},${csvEscape(result.profileCommentTotal)},${csvEscape(result.replyGuysPercentage)},${csvEscape(result.status)}\n`;
                        }
                        filename = `analiz-raporu-${timestamp}.csv`;
                        mimeType = 'text/csv';
                        break;
                    default:
                        data = results.map(r => `@${r.username}: ${r.ownerComments} own, ${r.otherComments} others, ${r.replyGuysPercentage} reply ratio`).join('\n');
                        filename = `analiz-raporu-${timestamp}.txt`;
                        mimeType = 'text/plain';
                }
            }
            const success = gm.download(data, filename, mimeType);
            setStatus(success ? `${format.toUpperCase()} raporu indirildi.` : 'İndirme başarısız.', success ? 'success' : 'error', 'la');
        };
        // Enhanced views export functionality
        const exportViewsData = (format) => {
            const list = parseUsernames(q('#la-views-usernames')?.value || '');
            if (!list.length) {
                setStatus('Listede kullanıcı yok.', 'error', 'la-views');
                return;
            }
            const rows = Array.from(q('#la-views-results tbody')?.querySelectorAll('tr') || []);
            const timestamp = Date.now();
            let filename, data, mimeType;
            if (!rows.length) {
                // Export usernames only
                switch (format) {
                    case 'json':
                        data = JSON.stringify({ users: list, exported: new Date().toISOString() }, null, 2);
                        filename = `goruntulenme-kullanicilar-${timestamp}.json`;
                        mimeType = 'application/json';
                        break;
                    case 'csv':
                        data = 'Kullanıcı\n' + list.join('\n');
                        filename = `goruntulenme-kullanicilar-${timestamp}.csv`;
                        mimeType = 'text/csv';
                        break;
                    default:
                        data = list.join('\n');
                        filename = `goruntulenme-kullanicilar-${timestamp}.txt`;
                        mimeType = 'text/plain';
                }
            } else {
                // Export views results
                const results = [];
                for (const tr of rows) {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length >= 5) {
                        results.push({
                            username: tds[0].textContent.replace(/^@/, ''),
                            profileViewTotal: tds[1].textContent.replace(/,/g, '').trim(),
                            userTopTotal: tds[2].textContent.replace(/,/g, '').trim(),
                            highViewEstimate: tds[3].textContent.trim(),
                            status: tds[4].textContent.trim()
                        });
                    }
                }
                switch (format) {
                    case 'json':
                        data = JSON.stringify({
                            results,
                            totalUsers: results.length,
                            exported: new Date().toISOString(),
                            metadata: {
                                version: '10.2.0',
                                type: 'views_analysis'
                            }
                        }, null, 2);
                        filename = `goruntulenme-raporu-${timestamp}.json`;
                        mimeType = 'application/json';
                        break;
                    case 'xlsx':
                        data = 'Kullanıcı,Profil Görüntülenme Toplamı,Kullanıcı Görüntülenme Toplamı,YGT %,Durum\n';
                        for (const result of results) {
                            data += `${csvEscape(result.username)},${csvEscape(result.profileViewTotal)},${csvEscape(result.userTopTotal)},${csvEscape(result.highViewEstimate)},${csvEscape(result.status)}\n`;
                        }
                        filename = `goruntulenme-raporu-${timestamp}.xlsx`;
                        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                        break;
                    case 'csv':
                        data = 'Kullanıcı,Profil Görüntülenme Toplamı,Kullanıcı Görüntülenme Toplamı,YGT %,Durum\n';
                        for (const result of results) {
                            data += `${csvEscape(result.username)},${csvEscape(result.profileViewTotal)},${csvEscape(result.userTopTotal)},${csvEscape(result.highViewEstimate)},${csvEscape(result.status)}\n`;
                        }
                        filename = `goruntulenme-raporu-${timestamp}.csv`;
                        mimeType = 'text/csv';
                        break;
                    default:
                        data = results.map(r => `@${r.username}: Profil:${r.profileViewTotal} Top:${r.userTopTotal} Tahmin:%${r.highViewEstimate}`).join('\n');
                        filename = `goruntulenme-raporu-${timestamp}.txt`;
                        mimeType = 'text/plain';
                }
            }
            const success = gm.download(data, filename, mimeType);
            setStatus(success ? `${format.toUpperCase()} raporu indirildi.` : 'İndirme başarısız.', success ? 'success' : 'error', 'la-views');
        };

        // Event listener for the new unified scraping tab
        q('#tab-user-scraping')?.addEventListener('change', (e) => {
            if (e.target.name === 'scrapingType') {
                const instructionsEl = q('#la-scraping-instructions');
                const selectedType = e.target.value;
                if (!instructionsEl) return;
                switch (selectedType) {
                    case 'profile':
                        instructionsEl.innerHTML = '<strong>Kullanım:</strong> Bir kullanıcının "Takipçiler" veya "Takip Edilenler" sayfasına gidin. Ardından "Başlat" butonuna basın. Araç, sayfadaki <strong>doğrulanmış (mavi/sarı tikli)</strong> kullanıcıları otomatik olarak çekecektir.';
                        break;
                    case 'popup':
                        instructionsEl.innerHTML = '<strong>Kullanım:</strong> Bir listenin "üyeler" sayfasını içeren popup penceresini açın, ardından "Başlat" butonuna basın. Araç, popup içindeki <strong>doğrulanmış (mavi/sarı tikli)</strong> kullanıcıları çekecektir.';
                        break;
                    case 'comments':
                        instructionsEl.innerHTML = '<strong>Kullanım:</strong> Yorumcularını çekmek istediğiniz bir tweetin detay sayfasını açın, ardından "Başlat" butonuna basın. Araç, tweet altındaki <strong>doğrulanmış (mavi/sarı tikli)</strong> yorumcuları çekecektir.';
                        break;
                }
            }
        });
        // Event listeners
        q('#la-pause-resume')?.addEventListener('click', togglePauseResume);
        q('#la-save-settings')?.addEventListener('click', handleSaveSettings);
        q('#la-stop')?.addEventListener('click', stopAnalysis);
        q('#la-close')?.addEventListener('click', () => { fr.style.display = 'none'; });
        q('#la-usernames')?.addEventListener('input', refreshCount);
        q('#la-views-usernames')?.addEventListener('input', refreshViewsCount);
        q('#la-load-history')?.addEventListener('click', loadHistoryData);
        q('#la-clear-history')?.addEventListener('click', clearHistory);
        // Fixed export button event listeners
        q('#export-csv')?.addEventListener('click', () => exportAnalysisData('csv'));
        q('#export-json')?.addEventListener('click', () => exportAnalysisData('json'));
        q('#export-xlsx')?.addEventListener('click', () => exportAnalysisData('xlsx'));
        q('#export-txt')?.addEventListener('click', () => exportAnalysisData('txt'));
        // Views export button event listeners
        q('#views-export-csv')?.addEventListener('click', () => exportViewsData('csv'));
        q('#views-export-json')?.addEventListener('click', () => exportViewsData('json'));
        q('#views-export-xlsx')?.addEventListener('click', () => exportViewsData('xlsx'));
        q('#views-export-txt')?.addEventListener('click', () => exportViewsData('txt'));
         // Bot settings handlers
        const botParamDiv = q('#tab-settings');
        botParamDiv.querySelectorAll('input[type="range"]').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const paramName = e.target.id.split('-').pop();
                const numberInput = botParamDiv.querySelector(`#la-bot-param-value-${paramName}`);
                if (numberInput) numberInput.value = e.target.value;
            });
        });
        botParamDiv.querySelectorAll('input[type="number"]').forEach(numberInput => {
            numberInput.addEventListener('input', (e) => {
                const paramName = e.target.id.split('-').pop();
                const slider = botParamDiv.querySelector(`#la-bot-param-${paramName}`);
                if (slider) slider.value = e.target.value;
            });
        });
        q('#la-bot-fetch-models')?.addEventListener('click', async () => {
            const apiKey = q('#la-bot-api-key').value;
            const statusEl = q('#la-settings-status');
            if (!apiKey) {
                statusEl.textContent = 'Lütfen önce API anahtarını girin.';
                statusEl.className = 'muted status error';
                return;
            }
            statusEl.textContent = 'Modeller getiriliyor...';
            statusEl.className = 'muted status loading';
            try {
                const response = await gm.request({
                    method: 'GET',
                    url: `${CONFIG.BOT.API_URL}/models`,
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    responseType: 'json'
                });
                if (response.status === 200 && response.response.data) {
                    const models = response.response.data;
                    const selectEl = q('#la-bot-model-list');
                    selectEl.innerHTML = '<option value="">Bir model seçin...</option>';
                    models.forEach(model => {
                        const option = doc.createElement('option');
                        option.value = model.id;
                        option.textContent = model.name || model.id;
                        selectEl.appendChild(option);
                    });
                    statusEl.textContent = `${models.length} model başarıyla getirildi.`;
                    statusEl.className = 'muted status success';
                } else {
                    throw new Error(`API Hatası: ${response.status} - ${response.response?.error?.message || response.statusText}`);
                }
            } catch (error) {
                console.error('Model getirme hatası:', error);
                statusEl.textContent = `Model getirme hatası: ${error.message}`;
                statusEl.className = 'muted status error';
            }
        });
        // Centralized Start functions for each tab
        const startReplyAnalysis = async () => {
            if (ANALYSIS_RUNNING) {
                setStatus('Analiz zaten çalışıyor.', 'error', 'la');
                return;
            }
            const usernames = parseUsernames(q('#la-usernames')?.value || '');
            if (!usernames.length) {
                setStatus('Kullanıcı listesi boş.', 'error', 'la');
                return;
            }
            // Validate user count
            if (usernames.length > CONFIG.LIMITS.MAX_USER_LIST_SIZE) {
                const batchMode = q('#la-batch-mode')?.checked;
                if (!batchMode) {
                    setStatus(`Çok fazla kullanıcı (${usernames.length}). Batch modu açın.`, 'error', 'la');
                    return;
                }
            }
            const settings = loadSettings() || CONFIG.DEFAULTS;
            const lastN = parseInt(q('#la-lastn')?.value || String(settings.lastn || CONFIG.DEFAULTS.LAST_N));
            const maxReplyScrolls = parseInt(q('#la-maxrs')?.value || String(settings.maxrs || CONFIG.DEFAULTS.MAX_RS));
            const scrollDelay = parseInt(q('#la-scroll-delay')?.value || String(settings.scrollDelay || CONFIG.DEFAULTS.SCROLL_DELAY));
            const globalScrollSteps = parseInt(q('#la-global-scroll-steps')?.value || String(settings.globalScrollSteps || CONFIG.DEFAULTS.GLOBAL_SCROLL_STEPS));
            const batchSize = parseInt(q('#la-batch-size')?.value || String(settings.batchSize || CONFIG.DEFAULTS.BATCH_SIZE));
            const profileWaitDelay = parseInt(q('#la-profile-wait-delay')?.value || String(settings.profileWaitDelay || CONFIG.DEFAULTS.PROFILE_WAIT_DELAY));
            const executionMode = q('#la-execution-mode')?.value || CONFIG.DEFAULTS.EXECUTION_MODE;
            const batchMode = usernames.length > batchSize;
            ANALYSIS_RUNNING = true;
            ANALYSIS_PAUSED = false;
            ANALYSIS_CANCELLED = false;
            updateGlobalScriptState();
            updateControlButtons();
            setStatus('Analiz başlatılıyor...', 'loading', 'la');
            showRateLimitWarning(false, 'la');
            const tbody = q('#la-results tbody');
            if (tbody) tbody.innerHTML = '';
            setProgress(0, 'la');
            const startHistoryEntry = {
                timestamp: Date.now(),
                action: 'analysis_started',
                userCount: usernames.length,
                settings: { lastN, maxReplyScrolls, scrollDelay, globalScrollSteps, batchMode, batchSize, profileWaitDelay, executionMode }
            };
            saveToHistory(startHistoryEntry);
            let processed = 0;
            const batches = batchMode ?
                Array.from({ length: Math.ceil(usernames.length / batchSize) }, (_, i) =>
                    usernames.slice(i * batchSize, (i + 1) * batchSize)
                ) : [usernames];
            try {
                for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                    const batch = batches[batchIndex];
                    if (ANALYSIS_CANCELLED) {
                        setStatus(currentLang.CANCELLED, 'warning', 'la');
                        break;
                    }
                    if (batchMode) {
                        setStatus(`Batch ${batchIndex + 1}/${batches.length} işleniyor...`, 'loading', 'la');
                        if (batchIndex > 0) {
                            await sleep(CONFIG.SITE.RATE_LIMIT_DELAY / 2);
                        }
                    }
                    for (const username of batch) {
                        if (ANALYSIS_CANCELLED) break;
                        while (ANALYSIS_PAUSED && !ANALYSIS_CANCELLED) {
                            const state = getGlobalScriptState();
                            ANALYSIS_PAUSED = state.paused;
                            updateControlButtons();
                            if (ANALYSIS_PAUSED) {
                                setDetailedProgress(username, processed + 1, usernames.length, 'Duraklatıldı', 'la');
                            } else {
                                setDetailedProgress(username, processed + 1, usernames.length, 'Devam ediyor', 'la');
                            }
                            await sleep(500);
                        }
                        if (ANALYSIS_CANCELLED) break;
                        while (openTabs.length >= CONFIG.LIMITS.MAX_CONCURRENT_TABS && !ANALYSIS_CANCELLED) {
                            await sleep(1000);
                            openTabs = openTabs.filter(tab => {
                                try {
                                    return tab && !tab.closed;
                                } catch {
                                    return false;
                                }
                            });
                        }
                        if (ANALYSIS_CANCELLED) break;
                        if (rateLimitDetected) {
                            showRateLimitWarning(true, 'la');
                            await handleRateLimit();
                            showRateLimitWarning(false, 'la');
                        }
                        setDetailedProgress(username, processed + 1, usernames.length, 'Analiz ediliyor', 'la');
                        const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        let analysisResult;
                        try {
                            const tab = openWorkerTab(username, lastN, maxReplyScrolls, scrollDelay, 99999, 0, globalScrollSteps, runId, executionMode);
                            openTabs.push(tab);
                            analysisResult = await waitForResult(runId, CONFIG.SITE.NETWORK_TIMEOUT);
                            const tabIndex = openTabs.indexOf(tab);
                            if (tabIndex > -1) openTabs.splice(tabIndex, 1);
                            try { if (tab && !tab.closed) tab.close(); } catch (e) { console.warn('Failed to close tab:', e); }
                        } catch (error) {
                            console.error(`Analysis failed for ${username}:`, error);
                            analysisResult = { username, error: isRateLimited(error) ? currentLang.RATE_LIMITED : currentLang.NETWORK_ERROR, ownerComments: 0, otherComments: 0, profileCommentTotal: 0, uniqueCommenters: 0, replyGuysPercentage: 0 };
                        }
                        const row = analysisResult && !analysisResult.error ?
                            { username: analysisResult.username, ownerComments: analysisResult.ownerComments ?? 0, otherComments: analysisResult.otherComments ?? 0, profileCommentTotal: analysisResult.profileCommentTotal ?? 0, uniqueCommenters: analysisResult.uniqueCommenters ?? 0, replyGuysPercentage: analysisResult.replyGuysPercentage ?? 0, status: 'Başarılı' } :
                            { username, error: (analysisResult && analysisResult.error) || 'Hata/Timeout: Arka plan sekmesi başlatılamadı', ownerComments: 0, otherComments: 0, profileCommentTotal: 0, uniqueCommenters: 0, replyGuysPercentage: 0, status: 'Hatalı' };
                        appendRow(tbody, row);
                        processed++;
                        setProgress(Math.round((processed / usernames.length) * 100), 'la-analysis');
                        // Add profile wait delay between users
                        if (processed < usernames.length && profileWaitDelay > 0) {
                            setDetailedProgress(username, processed, usernames.length, `${profileWaitDelay}sn bekleniyor...`, 'la');
                            await sleep(profileWaitDelay * 1000);
                        }
                        await sleep(randomDelay(1000, 2000));
                    }
                }
                if (!ANALYSIS_CANCELLED) {
                    setStatus('Analiz tamamlandı.', 'success', 'la-analysis');
                    saveToHistory({ timestamp: Date.now(), action: 'analysis_completed', processedUsers: processed, totalUsers: usernames.length, success: true });
                    if (await requestNotificationPermission()) {
                        showDesktopNotification('Analiz Tamamlandı', { body: `${processed} kullanıcı başarıyla analiz edildi.` });
                    }
                } else {
                    saveToHistory({ timestamp: Date.now(), action: 'analysis_cancelled', processedUsers: processed, totalUsers: usernames.length });
                }
            } catch (error) {
                console.error('Analysis error:', error);
                setStatus(`Analiz hatası: ${error.message}`, 'error', 'la-analysis');
                saveToHistory({ timestamp: Date.now(), action: 'analysis_error', error: error.message, processedUsers: processed, totalUsers: usernames.length });
            } finally {
                ANALYSIS_RUNNING = false;
                ANALYSIS_PAUSED = false;
                ANALYSIS_CANCELLED = false;
                updateGlobalScriptState();
                updateControlButtons();
                if (q('#la-detailed-progress')) q('#la-detailed-progress').style.display = 'none';
                cleanupResources();
            }
        };
        const startViewsAnalysis = async () => {
            if (VIEWS_ANALYSIS_RUNNING) {
                setStatus('Analiz zaten çalışıyor.', 'error', 'la-views');
                return;
            }
            const usernames = parseUsernames(q('#la-views-usernames')?.value || '');
            if (!usernames.length) {
                setStatus('Kullanıcı listesi boş.', 'error', 'la-views');
                return;
            }
            const tweetCount = parseInt(q('#la-views-tweet-count')?.value || '5');
            const topCount = parseInt(q('#la-views-top-count')?.value || '10');
            const minThreshold = parseInt(q('#la-views-min-threshold')?.value || '1000');
            const executionMode = q('#la-execution-mode')?.value || CONFIG.DEFAULTS.EXECUTION_MODE;
            VIEWS_ANALYSIS_RUNNING = true;
            ANALYSIS_CANCELLED = false;
            ANALYSIS_PAUSED = false;
            updateGlobalScriptState();
            updateControlButtons();
            setStatus('Görüntülenme analizi başlatılıyor...', 'loading', 'la-views');
            setProgress(0, 'la-views');
            showRateLimitWarning(false, 'la-views');
            const tbody = q('#la-views-results tbody');
            if (tbody) tbody.innerHTML = '';
            try {
                const results = await analyzeViewsForUsers(usernames, tweetCount, topCount, minThreshold, (progress, currentUser, currentIndex, totalUsers, currentStep) => {
                    setProgress(progress, 'la-views');
                    if (currentUser) {
                        setDetailedProgress(currentUser, currentIndex, totalUsers, currentStep, 'la-views');
                    }
                }, executionMode);
                for (const result of results) {
                    const tr = doc.createElement('tr');
                    const statusClass = result.status === 'Başarılı' ? 'success' : 'error';
                    tr.innerHTML = `
                        <td>@${escapeHtml(result.username)}</td>
                        <td>${result.profileViewTotal.toLocaleString()}</td>
                        <td>${result.userTopTotal.toLocaleString()}</td>
                        <td>${result.highViewEstimate}%</td>
                        <td class="${statusClass}">${escapeHtml(result.status)}</td>
                    `;
                    tbody.appendChild(tr);
                }
                setStatus('Görüntülenme analizi tamamlandı.', 'success', 'la-views');
                setProgress(100, 'la-views');
                if (q('#la-views-detailed-progress')) q('#la-views-detailed-progress').style.display = 'none';
                if (await requestNotificationPermission()) {
                    showDesktopNotification('Görüntülenme Analizi Tamamlandı', { body: `${results.length} kullanıcı analiz edildi.` });
                }
            } catch (error) {
                console.error('Views analysis error:', error);
                setStatus(`Hata: ${error.message}`, 'error', 'la-views');
                if (q('#la-views-detailed-progress')) q('#la-views-detailed-progress').style.display = 'none';
            } finally {
                VIEWS_ANALYSIS_RUNNING = false;
                updateGlobalScriptState();
                updateControlButtons();
            }
        };
        const startCommentBot = async () => {
             if (COMMENT_BOT_RUNNING) {
                setStatus('Yorum botu zaten çalışıyor.', 'error',
'la-comment_bot');
                return;
            }
            const botSettings = loadSettings()?.bot;
            if (!botSettings || !botSettings.apiKey || !botSettings.model) {
                setStatus('Lütfen Ayarlar\'dan API anahtarını ve modeli yapılandırın.', 'error', 'la-comment_bot');
                return;
            }
            COMMENT_BOT_RUNNING = true;
            ANALYSIS_CANCELLED = false;
            ANALYSIS_PAUSED = false;
            updateGlobalScriptState();
            updateControlButtons();
            const logEl = q('#la-bot-log');
            const statusEl = q('#la-comment_bot-status');
            const timeLimit = parseInt(q('#la-bot-time-limit').value) || 1;
            const log = (message) => {
                if (logEl) {
                    logEl.value += `[${new Date().toLocaleTimeString()}] ${message}\n`;
                    logEl.scrollTop = logEl.scrollHeight;
                }
            };
            log('Yorum botu başlatıldı.');
            statusEl.textContent = 'Tweetler taranıyor...';
            statusEl.className = 'muted status loading';
            try {
                const commentedTweets = new Set(JSON.parse(gm.getValue('la_commented_tweets', '[]')));
                const mainContent = findElement(SELECTORS.MAIN.CONTENT);
                if (!mainContent) {
                    throw new Error('Ana içerik alanı bulunamadı.');
                }
                const articles = findElements(SELECTORS.TWEET.ARTICLE, mainContent);
                log(`${articles.length} tweet bulundu.`);
                let commentedCount = 0;
                for (const article of articles) {
                    if (ANALYSIS_CANCELLED) {
                        log('Bot kullanıcı tarafından durduruldu.');
                        break;
                    }
                     while (ANALYSIS_PAUSED && !ANALYSIS_CANCELLED) {
                        log('Bot duraklatıldı...');
                        await sleep(1000);
                    }
                    if (ANALYSIS_CANCELLED) break;

                    const timeEl = findElement(SELECTORS.TWEET.TIME, article);
                    const tweetDate = new Date(timeEl?.getAttribute('datetime'));
                    const tweetAgeMinutes = (Date.now() - tweetDate.getTime()) / 60000;

                    const permalinkEl = findElement(SELECTORS.TWEET.PERMALINK, article);
                    const tweetUrl = permalinkEl ? `https://${CONFIG.SITE.HOST}${permalinkEl.getAttribute('href')}` : null;
                    const tweetId = tweetUrl?.match(/\/status\/(\d+)/)?.[1];

                    if (!tweetId || commentedTweets.has(tweetId)) {
                        log(`Atlanıyor: ${tweetUrl} (zaten yorum yapılmış veya ID yok)`);
                        continue;
                    }

                    if (tweetAgeMinutes > timeLimit) {
                        log(`Atlanıyor: ${tweetUrl} (zaman limitini aşıyor - ${Math.round(tweetAgeMinutes)} dk)`);
                        continue;
                    }
                    log(`Uygun tweet bulundu: ${tweetUrl}`);
                    const tweetTextEl = findElement(SELECTORS.TWEET.TEXT, article);
                    const tweetText = tweetTextEl ? tweetTextEl.textContent.trim() : '';

                    if (!tweetText) {
                        log(`Atlanıyor: ${tweetUrl} (tweet metni boş)`);
                        continue;
                    }

                    statusEl.textContent = `Yapay zekadan yanıt bekleniyor: ${tweetId}`;
                    log(`Yapay zekaya gönderiliyor: "${tweetText.substring(0, 50)}..."`);

                    try {
                        const prompt = botSettings.prompt.replace('{tweet}', tweetText);
                        const response = await gm.request({
                            method: 'POST',
                            url: `${CONFIG.BOT.API_URL}/chat/completions`,
                            headers: {
                                'Authorization': `Bearer ${botSettings.apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            data: JSON.stringify({
                                model: botSettings.model,
                                messages: [{ role: 'user', content: prompt }],
                                ...botSettings.params
                            }),
                            responseType: 'json'
                        });

                        if (response.status === 200 && response.response?.choices?.[0]?.message?.content) {
                            const replyText = response.response.choices[0].message.content.trim();
                            log(`Yapay zeka yanıtı alındı: "${replyText.substring(0, 50)}..."`);

                            const replyButton = findElement(SELECTORS.TWEET.REPLY_BUTTON, article);
                            if (replyButton) {
                                replyButton.click();
                                await sleep(1500);

                                const textBox = await until(() => findElement(SELECTORS.TWEET.REPLY_TEXTBOX));
                                const tweetButton = findElement(SELECTORS.TWEET.TWEET_BUTTON);

                                if (textBox && tweetButton) {
                                    textBox.focus();
                                    textBox.innerHTML = replyText.replace(/\n/g, '<br>'); // Simulate typing
                                    // Trigger input event to enable the button
                                    textBox.dispatchEvent(new Event('input', { bubbles: true }));
                                    await sleep(500);

                                    if (!tweetButton.disabled) {
                                        tweetButton.click();
                                        log(`Başarılı: Yorum gönderildi: ${tweetId}`);
                                        commentedTweets.add(tweetId);
                                        gm.setValue('la_commented_tweets', JSON.stringify([...commentedTweets]));
                                        commentedCount++;
                                        await sleep(randomDelay(5000, 10000)); // Wait after tweeting
                                    } else {
                                        log(`Hata: Yorum gönderilemedi, Tweet butonu aktif değil. ${tweetId}`);
                                    }
                                } else {
                                    log(`Hata: Yorum kutusu veya Tweet butonu bulunamadı. ${tweetId}`);
                                }
                            }
                        } else {
                             throw new Error(`API Hatası: ${response.status} - ${response.response?.error?.message || 'Geçersiz yanıt'}`);
                        }
                    } catch (apiError) {
                        log(`API Hatası: ${apiError.message}`);
                         statusEl.textContent = `API Hatası, bir sonraki tweete geçiliyor...`;
                         await sleep(2000);
                    }
                }
                log(`Tarama tamamlandı. ${commentedCount} yeni yoruma yapıldı.`);
                statusEl.textContent = 'Tarama tamamlandı.';
                statusEl.className = 'muted status success';

            } catch (error) {
                console.error('Yorum botu hatası:', error);
                log(`Kritik Hata: ${error.message}`);
                statusEl.textContent = `Hata: ${error.message}`;
                statusEl.className = 'muted status error';
            } finally {
                COMMENT_BOT_RUNNING = false;
                updateGlobalScriptState();
                updateControlButtons();
            }
        };
        const startProfileListExtraction = async () => {
            if (USER_SCRAPING_RUNNING) {
                setStatus('Çıkarma işlemi zaten çalışıyor.', 'error', 'la-user-scraping');
                return;
            }
             if (!isProfileFollowListPage()) {
                setStatus('Bir kullanıcının takipçi veya takip edilenler sayfasında olmalısınız.', 'error', 'la-user-scraping');
                return;
            }
            USER_SCRAPING_RUNNING = true;
            ANALYSIS_CANCELLED = false;
            ANALYSIS_PAUSED = false;
            updateGlobalScriptState();
            updateControlButtons();
            setStatus('Takipçi/Takip listesinden doğrulanmış kişiler çekiliyor...', 'loading', 'la-user-scraping');
            setProgress(0, 'la-user-scraping');
            try {
                const settings = loadSettings() || CONFIG.DEFAULTS;
                const maxCount = parseInt(q('#la-popup-limit')?.value || String(settings.popupLimit || 0));
                const scrollDelay = parseInt(q('#la-popup-scroll-delay')?.value || String(settings.popupScrollDelay || 800));
                const globalScrollSteps = parseInt(q('#la-global-scroll-steps')?.value || String(settings.globalScrollSteps || CONFIG.DEFAULTS.GLOBAL_SCROLL_STEPS));
                const users = await extractUsersFromProfilePage((progress) => {
                    setProgress(progress, 'la-user-scraping');
                }, globalScrollSteps, maxCount, scrollDelay);
                if (q('#la-user-scraping-results')) q('#la-user-scraping-results').value = users.join('\n');
                if (q('#la-user-scraping-count')) q('#la-user-scraping-count').textContent = users.length.toString();
                setStatus(`${users.length} doğrulanmış kişi çıkarıldı.`, 'success', 'la-user-scraping');
                setProgress(100, 'la-user-scraping');
            } catch (error) {
                console.error('Profile list extraction error:', error);
                let errorMessage = error.message;
                if (isRateLimited(error)) {
                    errorMessage = currentLang.RATE_LIMITED;
                    await handleRateLimit();
                }
                setStatus(`Hata: ${errorMessage}`, 'error', 'la-user-scraping');
            } finally {
                USER_SCRAPING_RUNNING = false;
                updateGlobalScriptState();
                updateControlButtons();
            }
        };
        const startPopupExtraction = async () => {
            if (USER_SCRAPING_RUNNING) {
                setStatus('Çıkarma işlemi zaten çalışıyor.', 'error', 'la-user-scraping');
                return;
            }
            USER_SCRAPING_RUNNING = true;
            ANALYSIS_CANCELLED = false;
            ANALYSIS_PAUSED = false;
            updateGlobalScriptState();
            updateControlButtons();
            setStatus('Popup\'tan doğrulanmış kişiler çekiliyor...', 'loading', 'la-user-scraping');
            setProgress(0, 'la-user-scraping');
            try {
                const settings = loadSettings() || CONFIG.DEFAULTS;
                const globalScrollSteps = parseInt(q('#la-global-scroll-steps')?.value || String(settings.globalScrollSteps || CONFIG.DEFAULTS.GLOBAL_SCROLL_STEPS));
                const maxCount = parseInt(q('#la-popup-limit')?.value || String(settings.popupLimit || 0));
                const scrollDelay = parseInt(q('#la-popup-scroll-delay')?.value || String(settings.popupScrollDelay || 800));
                const users = await extractUsersFromPopup((progress) => {
                    setProgress(progress, 'la-user-scraping');
                }, globalScrollSteps, maxCount, scrollDelay);
                if (q('#la-user-scraping-results')) q('#la-user-scraping-results').value = users.join('\n');
                if (q('#la-user-scraping-count')) q('#la-user-scraping-count').textContent = users.length.toString();
                setStatus(`${users.length} doğrulanmış kişi çıkarıldı.`, 'success', 'la-user-scraping');
                setProgress(100, 'la-user-scraping');
            } catch (error) {
                console.error('Popup extraction error:', error);
                let errorMessage = error.message;
                if (isRateLimited(error)) {
                    errorMessage = currentLang.RATE_LIMITED;
                    await handleRateLimit();
                }
                setStatus(`Hata: ${errorMessage}`, 'error', 'la-user-scraping');
            } finally {
                USER_SCRAPING_RUNNING = false;
                updateGlobalScriptState();
                updateControlButtons();
            }
        };
        const startCommentExtraction = async () => {
            if (USER_SCRAPING_RUNNING) {
                setStatus('Çıkarma işlemi zaten çalışıyor.', 'error', 'la-user-scraping');
                return;
            }
            if (!isTweetDetail()) {
                setStatus('Bir tweet sayfasında olmalısınız.', 'error', 'la-user-scraping');
                return;
            }
            USER_SCRAPING_RUNNING = true;
            ANALYSIS_CANCELLED = false;
            ANALYSIS_PAUSED = false;
            updateGlobalScriptState();
            updateControlButtons();
            const settings = loadSettings() || CONFIG.DEFAULTS;
            const scrollDelay = parseInt(q('#la-comment-delay')?.value || String(settings.commentDelay || 1000));
            const maxCount = parseInt(q('#la-comment-limit')?.value || String(settings.commentLimit || 0));
            setStatus('Tweet\'ten doğrulanmış yorumcular çekiliyor...', 'loading', 'la-user-scraping');
            setProgress(0, 'la-user-scraping');
            try {
                const maxScrolls = parseInt(q('#la-maxrs')?.value || String(settings.maxrs || CONFIG.DEFAULTS.MAX_RS));
                const commenters = await extractCommentersFromTweet(maxScrolls, scrollDelay, (progress) => {
                    setProgress(progress, 'la-user-scraping');
                }, maxCount);
                if (q('#la-user-scraping-results')) q('#la-user-scraping-results').value = commenters.join('\n');
                if (q('#la-user-scraping-count')) q('#la-user-scraping-count').textContent = commenters.length.toString();
                setStatus(`${commenters.length} doğrulanmış yorumcu çıkarıldı.`, 'success', 'la-user-scraping');
                setProgress(100, 'la-user-scraping');
            } catch (error) {
                console.error('Comment extraction error:', error);
                let errorMessage = error.message;
                if (isRateLimited(error)) {
                    errorMessage = currentLang.RATE_LIMITED;
                    await handleRateLimit();
                }
                setStatus(`Hata: ${errorMessage}`, 'error', 'la-user-scraping');
            } finally {
                USER_SCRAPING_RUNNING = false;
                updateGlobalScriptState();
                updateControlButtons();
            }
        };

        const startUserScraping = async () => {
            const selectedType = q('input[name="scrapingType"]:checked')?.value;
            switch (selectedType) {
                case 'profile':
                    await startProfileListExtraction();
                    break;
                case 'popup':
                    await startPopupExtraction();
                    break;
                case 'comments':
                    await startCommentExtraction();
                    break;
                default:
                    setStatus('Lütfen bir çekme türü seçin.', 'error', 'la-user-scraping');
            }
        };
        // Centralized Start Button Dispatcher
        q('#la-start')?.addEventListener('click', async () => {
            const activeTab = q('.tab-content.active');
            if (!activeTab) return;
            switch (activeTab.id) {
                case 'tab-analysis':
                    await startReplyAnalysis();
                    break;
                case 'tab-views':
                    await startViewsAnalysis();
                    break;
                 case 'tab-comment-bot':
                    await startCommentBot();
                    break;
                case 'tab-user-scraping':
                    await startUserScraping();
                    break;
            }
        });
        // Enhanced clear functionality (Context-aware)
        q('#la-clear')?.addEventListener('click', () => {
            const activeTab = doc.querySelector('.tab-content.active');
            const activeTabId = activeTab ? activeTab.id : 'tab-analysis';
             const prefix = activeTabId.replace('tab-', 'la-');
            const isAnyAnalysisRunning = ANALYSIS_RUNNING || VIEWS_ANALYSIS_RUNNING || USER_SCRAPING_RUNNING || COMMENT_BOT_RUNNING;
            if (isAnyAnalysisRunning) {
                setStatus('Analiz sürüyor, önce durdurun.', 'error', prefix.replace(/-/g, '_'));
                return;
            }
            switch (activeTabId) {
                case 'tab-analysis':
                    if (q('#la-usernames')) q('#la-usernames').value = '';
                    if (q('#la-results tbody')) q('#la-results tbody').innerHTML = '';
                    refreshCount();
                    setStatus('Veriler temizlendi.', 'success', 'la-analysis');
                    setProgress(0, 'la-analysis');
                    if (q('#la-detailed-progress')) q('#la-detailed-progress').style.display = 'none';
                    cleanupResources();
                    break;
                case 'tab-views':
                    if (q('#la-views-usernames')) q('#la-views-usernames').value = '';
                    if (q('#la-views-results tbody')) q('#la-views-results tbody').innerHTML = '';
                    refreshViewsCount();
                    setStatus('Görüntülenme verileri temizlendi.', 'success', 'la-views');
                    setProgress(0, 'la-views');
                    if (q('#la-views-detailed-progress')) q('#la-views-detailed-progress').style.display = 'none';
                    break;
                case 'tab-comment-bot':
                    if (q('#la-bot-log')) q('#la-bot-log').value = '';
                    setStatus('Bot kayıtları temizlendi.', 'success', 'la-comment_bot');
                    break;
                case 'tab-user-scraping':
                    if (q('#la-user-scraping-results')) q('#la-user-scraping-results').value = '';
                    if (q('#la-user-scraping-count')) q('#la-user-scraping-count').textContent = '0';
                    setStatus('Liste temizlendi.', 'success', 'la-user-scraping');
                    setProgress(0, 'la-user-scraping');
                    break;
            }
        });
        // Context-aware export button
        q('#la-export')?.addEventListener('click', () => {
            const activeTab = q('.tab-content.active');
            if (!activeTab) return;
             const prefix = activeTab.id.replace('tab-', 'la-').replace(/-/g,'_');
            switch (activeTab.id) {
                case 'tab-analysis':
                    exportAnalysisData('csv');
                    break;
                case 'tab-views':
                    exportViewsData('csv');
                    break;
                 case 'tab-comment-bot': {
                    const logContent = q('#la-bot-log')?.value.trim();
                    if (!logContent) {
                        setStatus('İndirilecek kayıt yok.', 'error', 'la-comment_bot');
                        return;
                    }
                    const success = gm.download(logContent, `yorum-botu-kayit-${Date.now()}.txt`);
                    setStatus(success ? 'Kayıt dosyası indirildi.' : 'İndirme başarısız.', success ? 'success' : 'error', 'la-comment_bot');
                    break;
                }
                case 'tab-user-scraping': {
                    const users = q('#la-user-scraping-results')?.value.trim();
                    if (!users) {
                        setStatus('Çıkarılmış kullanıcı yok.', 'error', 'la-user-scraping');
                        return;
                    }
                    const selectedType = q('input[name="scrapingType"]:checked')?.value || 'liste';
                    const success = gm.download(users, `dogrulanmis-kullanicilar-${selectedType}-${Date.now()}.txt`);
                    setStatus(success ? 'TXT dosyası indirildi.' : 'İndirme başarısız.', success ? 'success' : 'error', 'la-user-scraping');
                    break;
                }
                default:
                    setStatus('Bu sekme için dışa aktarma mevcut değil.', 'warning', prefix);
            }
        });
        // Enhanced row appending with status
        function appendRow(tbody, res) {
            if (!tbody) return;
            const tr = doc.createElement('tr');
            if (res && res.error) {
                tr.innerHTML = `<td>@${escapeHtml(res.username)}</td><td colspan="4" class="muted">Hata: ${escapeHtml(res.error)}</td><td class="error">Hatalı</td>`;
            } else {
                const ownerComments = parseFloat(res.ownerComments) || 0;
                const otherComments = parseFloat(res.otherComments) || 0;
                const profileTotal = parseFloat(res.profileCommentTotal) || 0;
                let percentage = 0;
                if (profileTotal > 0) {
                    percentage = (ownerComments / profileTotal) * 100;
                    percentage = Math.round(percentage * 100) / 100;
                }
                const statusClass = res.status === 'Başarılı' ? 'success' : 'error';
                tr.innerHTML = `<td>@${escapeHtml(res.username)}</td><td>${res.ownerComments}</td><td>${res.otherComments}</td><td>${res.profileCommentTotal}</td><td>${percentage}%</td><td class="${statusClass}">${escapeHtml(res.status || 'Bilinmeyen')}</td>`;
            }
            tbody.appendChild(tr);
        }
        // Load and apply saved settings
        const savedSettings = loadSettings();
        if (savedSettings) {
            applySettings(savedSettings);
        }
        // Initialize control buttons
        updateControlButtons();
        refreshCount();
        refreshViewsCount();
        // Initialize notifications
        requestNotificationPermission();
        // Load Chart.js for future use
        loadChartJS();
    }
    // Enhanced keyboard shortcuts with language support
    document.addEventListener('keydown', (event) => {
        if (event.altKey && event.key.toLowerCase() === 'q') {
            event.preventDefault();
            // Main window iframe control
            const iframe = document.querySelector('#la-ui-frame');
            if (iframe?.contentDocument) {
                const pauseBtn = iframe.contentDocument.querySelector('#la-pause-resume');
                if (pauseBtn) {
                    pauseBtn.click();
                    return;
                }
            }
            // Worker tab global state control
            const state = getGlobalScriptState();
            ANALYSIS_PAUSED = !state.paused;
            updateGlobalScriptState();
            console.log(`Analysis ${ANALYSIS_PAUSED ? 'paused' : 'resumed'} via keyboard shortcut`);
        }
        // ESC key to stop analysis
        const isAnyAnalysisRunning = ANALYSIS_RUNNING || VIEWS_ANALYSIS_RUNNING || USER_SCRAPING_RUNNING || COMMENT_BOT_RUNNING;
        if (event.key === 'Escape' && isAnyAnalysisRunning) {
            event.preventDefault();
            const iframe = document.querySelector('#la-ui-frame');
            if (iframe?.contentDocument) {
                const stopBtn = iframe.contentDocument.querySelector('#la-stop');
                if (stopBtn && stopBtn.style.display !== 'none') {
                    stopBtn.click();
                }
            }
        }
        // Ctrl+Shift+A to open/close panel
        if (event.ctrlKey && event.shiftKey && (event.key === 'A' || event.key === 'a')) {
            event.preventDefault();
            togglePanelVisible();
        }
        // Ctrl+Shift+S to save settings
        if (event.ctrlKey && event.shiftKey && (event.key === 'S' || event.key === 's')) {
            event.preventDefault();
            const iframe = document.querySelector('#la-ui-frame');
            if (iframe?.contentDocument) {
                const saveBtn = iframe.contentDocument.querySelector('#la-save-settings');
                if (saveBtn) saveBtn.click();
            }
        }
    });
    // Views worker child main function
    async function childViewsMainIfNeeded() {
        const params = new URLSearchParams(location.search);
        const scanMode = params.get('vm_views_scan');
        if (!scanMode) return;
        startKeepAliveWorker(); // Prevent background throttling
        // Use a unique session key for views analysis
        const VKEY = 'vm_dom_views_job';
        const readState = () => {
            try {
                const state = sessionStorage.getItem(VKEY);
                return state ? JSON.parse(state) : null;
            } catch (e) { console.warn('Failed to read views job state:', e); return null; }
        };
        const writeState = (o) => {
            try {
                sessionStorage.setItem(VKEY, JSON.stringify(o));
            } catch (e) { console.error('Failed to write views job state:', e); }
        };
        const profileUser = getUsernameFromPath();
        if (!profileUser) {
            console.error('Profile user not found in path for views analysis');
            return finalizeViewsAndClose(null, params.get('rid'), {
                username: 'unknown',
                error: 'User not found',
                profileViewTotal: 0,
                userTopTotal: 0,
                highViewEstimate: 0
            });
        }
        const executeWhenIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
        executeWhenIdle(async () => {
            const runId = params.get('rid') || `views_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            let job = readState();
            // If no job, or job is for a different user, start a new one.
            if (!job || job.username !== profileUser) {
                job = {
                    username: profileUser,
                    runId: runId,
                    tweetCount: 5, // Hardcoded to 5 as per request
                    topCount: parseInt(params.get('topCount') || '10'),
                    phase: 'collect_profile_info',
                    tweetLinks: [],
                    index: 0,
                    profileViewTotal: 0,
                    userTopTotal: 0,
                    startTime: Date.now()
                };
                writeState(job);
            }
            try {
                // Phase 1: On the user's profile page, collect info and links
                if (job.phase === 'collect_profile_info' && !isTweetDetail()) {
                    await sleep(2000);
                    const main = await until(() => findElement(SELECTORS.MAIN.CONTENT), { timeout: 45000, interval: 500 });
                    if (!main) throw new Error('Main content area not found');
                    // Check for private account
                    const restrictionIndicators = [
                        'This account owner limits who can view their posts',
                        'Bu hesap sahibi gönderilerini kimlerin görüntüleyebileceğini kısıtlıyor',
                        'This account is private', 'Protected account', 'Korumalı hesap'
                    ];
                    for (const indicator of restrictionIndicators) {
                        if (main.textContent.includes(indicator)) throw new Error('Private account - access restricted');
                    }
                    // *** MODIFIED LOGIC START ***
                    // 1. Initialize profile view total
                    job.profileViewTotal = 0;
                    // 2. Collect tweet links and sum their view counts simultaneously
                    const tweetLinks = new Set();
                    const maxScrollSteps = 30; // Increased scroll steps to ensure finding tweets
                    window.scrollTo(0, 0);
                    await sleep(1000);
                    for (let i = 0; i < maxScrollSteps && tweetLinks.size < job.tweetCount; i++) {
                        const articles = findElements(SELECTORS.TWEET.ARTICLE, main);
                        for (const art of articles) {
                            if (tweetLinks.size >= job.tweetCount) break;
                            if (isRetweetOrReply(art)) continue;
                            const author = getArticleAuthorHandle(art);
                            if (!author || author.toLowerCase() !== profileUser.toLowerCase()) continue;
                            const tweetText = findElement(SELECTORS.TWEET.TEXT, art);
                            const isReplyToSomeone = art.textContent.includes('Replying to') || art.textContent.includes('yanıtlıyor');
                            if (tweetText && tweetText.textContent.trim() && !isReplyToSomeone) {
                                const link = findPermalink(art, profileUser);
                                if (link && !tweetLinks.has(link)) {
                                    tweetLinks.add(link);
                                    const viewCount = extractViewCountFromTweet(art);
                                    if (viewCount > 0) {
                                        job.profileViewTotal += viewCount;
                                    }
                                }
                            }
                        }
                        if (tweetLinks.size >= job.tweetCount) break;
                        window.scrollBy(0, window.innerHeight);
                        await sleep(randomDelay(1000, 1500));
                    }
                    job.tweetLinks = Array.from(tweetLinks);
                    // *** MODIFIED LOGIC END ***
                    if (job.tweetLinks.length === 0) {
                        throw new Error("No original tweets found to process.");
                    }
                    // Transition to next phase (similar to Yanıt Analizi)
                    job.phase = 'process_tweets';
                    job.index = 0;
                    writeState(job);
                    // Navigate to the first tweet for comment view analysis
                    const nextUrl = new URL(job.tweetLinks[0]);
                    nextUrl.search = params.toString();
                    location.href = nextUrl.href;
                    return;
                }
                // Phase 2: On a tweet detail page, process comments
                if (job.phase === 'process_tweets' && isTweetDetail()) {
                    await sleep(3000); // Wait for page load
                    const mainTweet = await until(() => findElement(SELECTORS.TWEET.ARTICLE), { timeout: 15000 });
                    if (!mainTweet) throw new Error("Could not find main tweet on detail page.");
                    const commentViews = new Map();
                    const maxScrolls = 20;
                    let stableCount = 0;
                    let lastViewCount = 0;
                    for (let i = 0; i < maxScrolls; i++) {
                        const articles = findElements(SELECTORS.TWEET.ARTICLE);
                        for (let j = 1; j < articles.length; j++) {
                            const article = articles[j];
                            const tweetId = getTweetIdFromArticle(article);
                            if (tweetId && !commentViews.has(tweetId)) {
                                const viewCount = extractViewCountFromTweet(article);
                                if (viewCount > 0) {
                                    commentViews.set(tweetId, viewCount);
                                }
                            }
                        }
                        if (commentViews.size === lastViewCount) {
                            stableCount++;
                            if (stableCount >= 3) break;
                        } else {
                            stableCount = 0;
                            lastViewCount = commentViews.size;
                        }
                        window.scrollBy(0, window.innerHeight * 0.8);
                        await sleep(randomDelay(1500, 2500));
                    }
                    const sortedCommentViews = Array.from(commentViews.values()).sort((a, b) => b - a);
                    const topCommentViews = sortedCommentViews.slice(0, job.topCount);
                    job.userTopTotal += topCommentViews.reduce((sum, current) => sum + current, 0);
                    job.index++;
                    writeState(job);
                    if (job.index < job.tweetLinks.length) {
                        const nextUrl = new URL(job.tweetLinks[job.index]);
                        nextUrl.search = params.toString();
                        location.href = nextUrl.href;
                        return;
                    } else {
                        let highViewEstimate = 0;
                        if (job.profileViewTotal > 0 && !isNaN(job.profileViewTotal)) {
                             highViewEstimate = Math.round((job.userTopTotal / job.profileViewTotal) * 100);
                        }
                        if(isNaN(highViewEstimate) || !isFinite(highViewEstimate)){
                             highViewEstimate = 0;
                        }
                        sessionStorage.removeItem(VKEY);
                        await finalizeViewsAndClose(profileUser, runId, {
                            username: profileUser,
                            profileViewTotal: job.profileViewTotal,
                            userTopTotal: job.userTopTotal,
                            highViewEstimate: highViewEstimate,
                            processedTweets: job.tweetLinks.length
                        });
                    }
                }
            } catch (error) {
                console.error('Views child worker error:', error);
                sessionStorage.removeItem(VKEY);
                await finalizeViewsAndClose(profileUser, job ? job.runId : runId, {
                    username: profileUser,
                    error: error.message || 'Unknown processing error',
                    profileViewTotal: job ? job.profileViewTotal : 0,
                    userTopTotal: job ? job.userTopTotal : 0,
                    highViewEstimate: 0
                });
            }
        }, { timeout: 100 });
    }
    // Finalize views analysis and close
    async function finalizeViewsAndClose(username, runId, resultObj) {
        console.log('Finalizing views analysis results:', resultObj);
        try {
            const enhancedResult = {
                ...resultObj,
                completedAt: Date.now(),
                version: '10.2.0',
                hostname: location.hostname
            };
            const success = gm.setValue(`vm_result_${runId}`, enhancedResult);
            if (!success) {
                console.error('Failed to save views results');
            }
        } catch (error) {
            console.error('Error saving views results:', error);
        }
        // Enhanced window close with delay and fallback
        setTimeout(() => {
            try {
                if (window.close) {
                    window.close();
                } else if (window.parent && window.parent.close) {
                    window.parent.close();
                }
                setTimeout(() => {
                    try {
                        if (window.history && window.history.back) {
                            window.history.back();
                        }
                    } catch (navError) {
                        console.warn('Failed to navigate back:', navError);
                    }
                }, 1000);
            } catch (closeError) {
                console.warn('Failed to close window:', closeError);
            }
        }, 300);
    }
    // Enhanced popup extraction with comprehensive error handling and fallbacks
    async function extractUsersFromPopup(progressCallback, maxScrollSteps, maxCount = 0, scrollDelay = 800) {
        console.log('Starting verified user extraction from popup...');
        const scrollContainer = await until(() => findElement(SELECTORS.POPUP.CONTAINER));
        if (!scrollContainer) {
            throw new Error("Popup scroll area not found. Please ensure the popup is open and properly loaded.");
        }
        console.log('Popup scroll container found:', scrollContainer);
        const users = new Set();
        let stableCount = 0;
        let lastCount = 0;
        for (let i = 0; i < maxScrollSteps; i++) {
            if (ANALYSIS_CANCELLED) {
                console.log('Popup extraction cancelled');
                break;
            }
            while (ANALYSIS_PAUSED && !ANALYSIS_CANCELLED) {
                await sleep(500);
            }
            if (ANALYSIS_CANCELLED) break;

            const userCells = findElements(SELECTORS.POPUP.USER_BUTTON, scrollContainer);
            for (const cell of userCells) {
                try {
                    const anchor = findElement('a[href^="/"][role="link"]', cell);
                    if (anchor) {
                        const href = anchor.getAttribute('href');
                        const match = href?.match(/^\/([A-Za-z0-9_]{1,20})$/);
                        if (match) {
                            const username = validateUsername(match[1]);
                            if (username && hasVerificationCheckmark(cell)) {
                                users.add(username);
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Error processing user cell:', error);
                }
            }

            const currentCount = users.size;
            if (progressCallback) {
                const progress = maxCount > 0 ? Math.min(100, (currentCount / maxCount) * 100) : Math.round((i / maxScrollSteps) * 100);
                progressCallback(progress);
            }

            if (maxCount > 0 && users.size >= maxCount) {
                console.log(`Reached maximum count limit: ${maxCount}`);
                break;
            }

            if (currentCount === lastCount) {
                stableCount++;
                if (stableCount >= 4) {
                    console.log('Content appears stable, stopping extraction');
                    break;
                }
            } else {
                stableCount = 0;
                lastCount = currentCount;
            }

            scrollContainer.scrollTop = scrollContainer.scrollHeight;
            await sleep(scrollDelay);
        }
        let finalUsers = Array.from(users);
        if (maxCount > 0) {
            finalUsers = finalUsers.slice(0, maxCount);
        }
        console.log(`Extracted ${finalUsers.length} verified users from popup.`);
        return finalUsers;
    }
     // Repaired function to extract users from a profile's followers/following page
    async function extractUsersFromProfilePage(progressCallback, maxScrollSteps, maxCount = 0, scrollDelay = 800) {
        console.log('Starting verified user extraction from profile page...');
        const users = new Set();
        let stableCount = 0;
        let lastCount = 0;
        let retryCount = 0;
        const maxRetries = 3;
        for (let i = 0; i < maxScrollSteps; i++) {
            if (ANALYSIS_CANCELLED) break;
            while (ANALYSIS_PAUSED && !ANALYSIS_CANCELLED) { await sleep(500); }
            if (ANALYSIS_CANCELLED) break;

            try {
                const userCells = findElements(SELECTORS.PROFILE.USER_CELL);
                if (userCells.length === 0 && i > 5) {
                    const mainContent = findElement(SELECTORS.MAIN.CONTENT);
                    if (!mainContent) throw new Error('Main content not found.');
                }

                for (const cell of userCells) {
                    const authorAnchor = findElement('a[href^="/"][role="link"]', cell);
                     if (authorAnchor) {
                        const href = authorAnchor.getAttribute('href');
                        const match = href?.match(/^\/([A-Za-z0-9_]{1,20})$/);
                        if (match) {
                            const username = validateUsername(match[1]);
                             if (username && hasVerificationCheckmark(cell)) {
                                users.add(username);
                            }
                        }
                    }
                }

                const currentCount = users.size;
                 if (progressCallback) {
                    const progress = maxCount > 0 ?
                        Math.min(100, (currentCount / maxCount) * 100) :
                        Math.round((i / maxScrollSteps) * 100);
                    progressCallback(progress);
                }

                if (maxCount > 0 && currentCount >= maxCount) {
                    console.log(`Reached maximum count limit: ${maxCount}`);
                    break;
                }

                if (currentCount === lastCount) {
                    stableCount++;
                    if (stableCount >= 4) {
                        console.log('Content appears stable, stopping extraction.');
                        break;
                    }
                } else {
                    stableCount = 0;
                    lastCount = currentCount;
                    retryCount = 0;
                }
                window.scrollBy(0, window.innerHeight * 0.9);
                await sleep(scrollDelay);
            } catch (error) {
                 console.error('Error during profile page scroll step:', error);
                retryCount++;
                if (retryCount >= maxRetries) {
                    console.error('Max retries reached for profile page extraction');
                    break;
                }
                await sleep(randomDelay(2000, 3000));
            }
        }
        let finalUsers = Array.from(users);
        if (maxCount > 0) {
            finalUsers = finalUsers.slice(0, maxCount);
        }
        console.log(`Extracted ${finalUsers.length} verified users from profile page.`);
        return finalUsers;
    }
    // Enhanced comment extraction with improved error handling
    async function extractCommentersFromTweet(maxScrolls, scrollDelay, progressCallback, maxCount = 0) {
        const commenters = new Set();
        let stableCount = 0;
        let lastCount = 0;
        for (let i = 0; i < maxScrolls; i++) {
            if (ANALYSIS_CANCELLED) {
                console.log('Comment extraction cancelled');
                break;
            }
            while (ANALYSIS_PAUSED && !ANALYSIS_CANCELLED) {
                await sleep(500);
            }
            if (ANALYSIS_CANCELLED) break;

            const articles = findElements(SELECTORS.TWEET.ARTICLE);
            for (let idx = 1; idx < articles.length; idx++) {
                try {
                    const article = articles[idx];
                    const authorHandle = getArticleAuthorHandle(article);
                    if (authorHandle && validateUsername(authorHandle)) {
                        if (hasVerificationCheckmark(article)) {
                            commenters.add(authorHandle);
                        }
                    }
                } catch (error) {
                    console.warn('Error processing article:', error);
                }
            }
            const currentCount = commenters.size;
            if (maxCount > 0 && commenters.size >= maxCount) {
                console.log(`Reached maximum commenter count: ${maxCount}`);
                break;
            }
            if (currentCount === lastCount) {
                stableCount++;
                if (stableCount >= 4) {
                    console.log('No new commenters found, stopping');
                    break;
                }
            } else {
                stableCount = 0;
                lastCount = currentCount;
            }
            const progress = Math.round((i / maxScrolls) * 100);
            if (progressCallback) progressCallback(progress);

            window.scrollTo(0, document.documentElement.scrollHeight);
            await sleep(scrollDelay);
        }
        let finalCommenters = Array.from(commenters);
        if (maxCount > 0) {
            finalCommenters = finalCommenters.slice(0, maxCount);
        }
        console.log(`Extracted ${finalCommenters.length} verified commenters.`);
        return finalCommenters;
    }
    // Enhanced worker tab management with better error handling
    function openWorkerTab(username, lastN, maxrs, scrollDelay, maxTweetAge, replyGuyRatio, globalScrollSteps, runId, executionMode = 'background') {
        const params = new URLSearchParams({
            vm_scan: '1',
            n: lastN,
            maxrs: maxrs,
            scrollDelay: scrollDelay,
            maxTweetAge: maxTweetAge,
            replyGuyRatio: replyGuyRatio,
            globalScrollSteps: globalScrollSteps,
            rid: runId
        });
        const url = `https://${CONFIG.SITE.HOST}/${encodeURIComponent(username)}?${params.toString()}`;
        let tab;
        try {
            switch (executionMode) {
                case 'window':
                    const windowName = `la_worker_${runId}`;
                    const windowFeatures = 'width=800,height=600,scrollbars=yes,resizable=yes';
                    tab = window.open(url, windowName, windowFeatures);
                    if (!tab) {
                        throw new Error('Yeni pencere açılamadı. Lütfen popup engelleyiciyi kontrol edin.');
                    }
                    break;
                case 'tab':
                    tab = gm.openInTab(url, { active: true, insert: true, setParent: true });
                    break;
                case 'background':
                default:
                    tab = gm.openInTab(url, { active: false, insert: true, setParent: true });
                    break;
            }
            if (executionMode !== 'background') {
                setTimeout(() => {
                    try {
                        if (tab && !tab.closed) {
                            tab.focus();
                        }
                    } catch (e) {
                        console.warn('Failed to focus tab/window:', e);
                    }
                }, 150);
            }
            return tab;
        } catch (error) {
            console.error(`Failed to open worker for mode "${executionMode}":`, error);
            throw new Error(`Çalışan sekmesi/penceresi açılamadı (${executionMode}): ${error.message}`);
        }
    }
    // Enhanced result waiting with better timeout handling
    async function waitForResult(runId, timeoutMs = CONFIG.SITE.NETWORK_TIMEOUT) {
        const key = `vm_result_${runId}`;
        const start = Date.now();
        let val = gm.getValue(key, null);
        if (val) {
            try {
                return typeof val === 'string' ? JSON.parse(val) : val;
            } catch (e) {
                console.warn('Failed to parse existing result:', e);
            }
        }
        return new Promise(async (resolve) => {
            let resolved = false;
            let listenerId = null;
            try {
                listenerId = gm.addListener(key, (_k, _o, v, remote) => {
                    if (remote && v && !resolved) {
                        resolved = true;
                        if (listenerId) gm.removeListener(listenerId);
                        try {
                            const result = typeof v === 'string' ? JSON.parse(v) : v;
                            resolve(result);
                        } catch (e) {
                            console.warn('Failed to parse result:', e);
                            resolve({ error: 'Invalid result format' });
                        }
                    }
                });
            } catch (e) {
                console.warn('Failed to set up result listener:', e);
            }
            let pollInterval = 400;
            const maxPollInterval = 2000;
            while (!resolved && Date.now() - start < timeoutMs) {
                try {
                    val = gm.getValue(key, null);
                    if (val) {
                        resolved = true;
                        if (listenerId) gm.removeListener(listenerId);
                        try {
                            const result = typeof val === 'string' ? JSON.parse(val) : val;
                            return resolve(result);
                        } catch (e) {
                            console.warn('Failed to parse polled result:', e);
                            return resolve({ error: 'Invalid result format' });
                        }
                    }
                } catch (e) {
                    console.warn('Polling error:', e);
                }
                await sleep(pollInterval);
                pollInterval = Math.min(pollInterval * 1.1, maxPollInterval);
            }
            if (!resolved) {
                if (listenerId) gm.removeListener(listenerId);
                resolve({
                    error: `Timeout: Background tab analysis failed (${Math.round(timeoutMs/1000)}s)`,
                    timeout: true
                });
            }
        });
    }
    // Enhanced child worker logic with comprehensive error handling
    async function childMainIfNeeded() {
        const params = new URLSearchParams(location.search);
        const scanMode = params.get('vm_scan') || params.get('vm_scanTweet');
        if (!scanMode) {
            await childViewsMainIfNeeded();
            return;
        }
        startKeepAliveWorker(); // Prevent background throttling
        const profileUser = getUsernameFromPath();
        if (!profileUser) {
            console.error('Profile user not found in path');
            return finalizeAndClose(null, params.get('rid'), {
                username: 'unknown',
                error: currentLang.DELETED_USER || 'User not found',
                ownerComments: 0,
                otherComments: 0,
                profileCommentTotal: 0,
                uniqueCommenters: 0,
                replyGuysPercentage: 0
            });
        }
        const executeWhenIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
        executeWhenIdle(async () => {
            const runId = params.get('rid') || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const SKEY = 'vm_dom_job';
            const readState = () => {
                try {
                    const state = sessionStorage.getItem(SKEY);
                    return state ? JSON.parse(state) : null;
                } catch (e) {
                    console.warn('Failed to read job state:', e);
                    return null;
                }
            };
            const writeState = (o) => {
                try {
                    sessionStorage.setItem(SKEY, JSON.stringify(o));
                } catch (e) {
                    console.error('Failed to write job state:', e);
                }
            };
            let job = readState();
            if (!job || job.username !== profileUser) {
                const lastN = parseInt(params.get('n') || String(CONFIG.DEFAULTS.LAST_N)); // Remove clamp
                const maxrs = parseInt(params.get('maxrs') || String(CONFIG.DEFAULTS.MAX_RS));
                const scrollDelay = parseInt(params.get('scrollDelay') || String(CONFIG.DEFAULTS.SCROLL_DELAY));
                const maxTweetAge = parseInt(params.get('maxTweetAge') || String(99999));
                const globalScrollSteps = parseInt(params.get('globalScrollSteps') || String(CONFIG.DEFAULTS.GLOBAL_SCROLL_STEPS));
                job = {
                    username: profileUser,
                    runId,
                    lastN,
                    maxrs,
                    scrollDelay,
                    maxTweetAge,
                    globalScrollSteps,
                    phase: 'collect',
                    tweetLinks: [],
                    index: 0,
                    ownerComments: 0,
                    otherComments: 0,
                    profileCommentTotal: 0,
                    uniqueCommenters: 0,
                    replyGuysPercentage: 0,
                    startTime: Date.now(),
                    errors: []
                };
                writeState(job);
            }
            try {
                if (job.phase === 'collect' && !isTweetDetail()) {
                    await collectOriginalTweetsIntoJob(job);
                    job = readState();
                    if (!job.tweetLinks || !job.tweetLinks.length) {
                        return finalizeAndClose(job.username, job.runId, {
                            username: job.username,
                            error: 'No original tweets found or loaded',
                            ownerComments: 0,
                            otherComments: 0,
                            profileCommentTotal: 0,
                            uniqueCommenters: 0,
                            replyGuysPercentage: 0
                        });
                    }
                    job.phase = 'process';
                    writeState(job);
                    const tweetUrl = `${job.tweetLinks[0]}?${new URLSearchParams({
                        vm_scanTweet: '1',
                        maxrs: job.maxrs,
                        scrollDelay: job.scrollDelay,
                        maxTweetAge: job.maxTweetAge,
                        replyGuyRatio: '0',
                        globalScrollSteps: job.globalScrollSteps,
                        rid: job.runId
                    }).toString()}`;
                    location.href = tweetUrl;
                    return;
                }
                if (job.phase === 'process' && isTweetDetail()) {
                    await processTweetAllReplies(job);
                    job = readState();
                    job.index = (job.index || 0) + 1;
                    writeState(job);
                    if (job.index < job.tweetLinks.length) {
                        const tweetUrl = `${job.tweetLinks[job.index]}?${new URLSearchParams({
                            vm_scanTweet: '1',
                            maxrs: job.maxrs,
                            scrollDelay: job.scrollDelay,
                            maxTweetAge: job.maxTweetAge,
                            replyGuyRatio: '0',
                            globalScrollSteps: job.globalScrollSteps,
                            rid: job.runId
                        }).toString()}`;
                        location.href = tweetUrl;
                        return;
                    }
                    await sleep(1500);
                    return finalizeAndClose(job.username, job.runId, {
                        username: job.username,
                        ownerComments: job.ownerComments || 0,
                        otherComments: job.otherComments || 0,
                        profileCommentTotal: job.profileCommentTotal || 0,
                        uniqueCommenters: job.uniqueCommenters || 0,
                        replyGuysPercentage: job.replyGuysPercentage || 0,
                        processingTime: Date.now() - (job.startTime || Date.now())
                    });
                }
                if (job.phase === 'process' && !isTweetDetail() && job.tweetLinks.length) {
                    const tweetUrl = `${job.tweetLinks[job.index] || job.tweetLinks[0]}?${new URLSearchParams({
                        vm_scanTweet: '1',
                        maxrs: job.maxrs,
                        scrollDelay: job.scrollDelay,
                        maxTweetAge: job.maxTweetAge,
                        replyGuyRatio: '0',
                        globalScrollSteps: job.globalScrollSteps,
                        rid: runId
                    }).toString()}`;
                    location.href = tweetUrl;
                }
            } catch (error) {
                console.error('Child worker error:', error);
                if (job.errors) {
                    job.errors.push({
                        timestamp: Date.now(),
                        phase: job.phase,
                        error: error.message
                    });
                    writeState(job);
                }
                return finalizeAndClose(job.username, job.runId, {
                    username: job.username,
                    error: error.message || 'Unknown processing error',
                    ownerComments: job.ownerComments || 0,
                    otherComments: job.otherComments || 0,
                    profileCommentTotal: job.profileCommentTotal || 0,
                    uniqueCommenters: job.uniqueCommenters || 0,
                    replyGuysPercentage: job.replyGuysPercentage || 0
                });
            }
        }, { timeout: 100 });
    }
    // Enhanced original tweet collection with better error handling and private account detection
    async function collectOriginalTweetsIntoJob(job) {
        const main = await until(() => findElement(SELECTORS.MAIN.CONTENT), { timeout: 45000, interval: 500 });
        if (!main) {
            throw new Error('Main content area not found');
        }
        await sleep(1500);
        const restrictionIndicators = [
            'This account owner limits who can view their posts',
            'Bu hesap sahibi gönderilerini kimlerin görüntüleyebileceğini kısıtlıyor',
            'This account is private',
            'Protected account',
            'Korumalı hesap'
        ];
        for (const indicator of restrictionIndicators) {
            if (main.textContent.includes(indicator)) {
                throw new Error(currentLang.PRIVATE_ACCOUNT || 'Private account - access restricted');
            }
        }
        const collected = new Set();
        const maxScrollSteps = job.globalScrollSteps || CONFIG.DEFAULTS.GLOBAL_SCROLL_STEPS;
        let profileCommentTotal = 0;
        let retryCount = 0;
        const maxRetries = 3;
        for (let i = 0; i < maxScrollSteps && collected.size < job.lastN; i++) {
            const state = getGlobalScriptState();
            if (state.cancelled) {
                console.log('Tweet collection cancelled');
                break;
            }
            if (state.paused && state.running) {
                console.log('Tweet collection paused');
                while (getGlobalScriptState().paused) {
                    await sleep(500);
                }
                console.log('Tweet collection resumed');
            }
            try {
                const articles = findElements(SELECTORS.TWEET.ARTICLE, main);
                console.log(`Found ${articles.length} articles in scroll ${i + 1}`);
                for (const art of articles) {
                    if (isRetweetOrReply(art)) continue;
                    const link = findPermalink(art, job.username);
                    const author = getArticleAuthorHandle(art);
                    if (link && !collected.has(link) && author && author.toLowerCase() === job.username.toLowerCase()) {
                        const tweetText = findElement(SELECTORS.TWEET.TEXT, art);
                        const isReply = art.textContent.includes('Replying to') || art.textContent.includes('yanıtlıyor');
                        if (tweetText && tweetText.textContent.trim() && !isReply) {
                            collected.add(link);
                            const commentCount = extractCommentCountFromTweet(art);
                            profileCommentTotal += commentCount;
                            console.log(`Added tweet with ${commentCount} comments, total: ${profileCommentTotal}`);
                        }
                    }
                    if (collected.size >= job.lastN) break;
                }
                if (collected.size >= job.lastN) break;
                try {
                    const scrollAmount = Math.min(window.innerHeight, 1500);
                    window.scrollBy(0, scrollAmount);
                } catch (scrollError) {
                    console.warn('Scroll error:', scrollError);
                    document.documentElement.scrollTop += 1500;
                }
                await sleep(randomDelay(1000, 2000));
                retryCount = 0;
            } catch (error) {
                console.error('Error in tweet collection step:', error);
                retryCount++;
                if (retryCount >= maxRetries) {
                    console.error('Max retries reached in tweet collection');
                    break;
                }
                if (isRateLimited(error)) {
                    await handleRateLimit();
                }
                await sleep(randomDelay(2000, 3000));
            }
        }
        const tweetLinks = [...collected].slice(0, job.lastN);
        const updatedJob = { ...job, tweetLinks, profileCommentTotal };
        try {
            sessionStorage.setItem('vm_dom_job', JSON.stringify(updatedJob));
            console.log(`Collected ${tweetLinks.length} tweets with total ${profileCommentTotal} comments`);
        } catch (error) {
            console.error('Failed to save job state:', error);
            throw new Error('Failed to save tweet collection results');
        }
    }
    // Enhanced retweet/reply detection with multiple indicators
    function isRetweetOrReply(articleEl) {
        const retweetIndicators = [
            'div[data-testid="socialContext"]',
            'span[data-testid="socialContext"]',
            '[aria-label*="Retweet"]',
            '[aria-label*="retweeted"]'
        ];
        const replyIndicators = [
            'Replying to',
            'yanıtlıyor',
            'Replying to @',
            '@.*yanıtlıyor'
        ];
        for (const selector of retweetIndicators) {
            if (findElement([selector], articleEl)) return true;
        }
        const articleText = articleEl.textContent || '';
        for (const indicator of replyIndicators) {
            if (articleText.includes(indicator)) return true;
        }
        return false;
    }
    // Enhanced permalink finding with fallbacks
    function findPermalink(articleEl, username) {
        const anchors = findElements(SELECTORS.TWEET.PERMALINK, articleEl);
        for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const match = href.match(/^\/([A-Za-z0-9_]{1,20})\/status\/\d+/);
            if (match && match[1].toLowerCase() === username.toLowerCase()) {
                return `https://${CONFIG.SITE.HOST}${href}`;
            }
        }
        return null;
    }
    function getTweetIdFromArticle(articleEl) {
        const anchor = findElement(SELECTORS.TWEET.PERMALINK, articleEl);
        const href = anchor?.getAttribute('href') || '';
        const match = href.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
    }
    function getArticleAuthorHandle(articleEl) {
        const anchor = findElement(SELECTORS.TWEET.AUTHOR, articleEl);
        const href = anchor?.getAttribute('href') || '';
        const match = href.match(/^\/([A-Za-z0-9_]{1,20})(?:\/)?$/);
        return match ? validateUsername(match[1]) : null;
    }
    // Enhanced reply collection with comprehensive error handling
    async function collectReplies(job) {
        const maxScrolls = parseInt(new URLSearchParams(location.search).get('maxrs') || String(job.maxrs || CONFIG.DEFAULTS.MAX_RS));
        const scrollDelay = parseInt(new URLSearchParams(location.search).get('scrollDelay') || String(job.scrollDelay || CONFIG.DEFAULTS.SCROLL_DELAY));
        const mainTweet = await until(() => findElement(SELECTORS.TWEET.ARTICLE), { timeout: 45000, interval: 500 });
        if (!mainTweet) {
            throw new Error('Main tweet not found');
        }
        await sleep(1500);
        let observer = null;
        try {
            observer = new MutationObserver(() => {});
            observer.observe(document.body, { childList: true, subtree: true });
            activeObservers.push(observer);
        } catch (error) {
            console.warn('Failed to create mutation observer:', error);
        }
        const snapshots = [];
        let stable = 0;
        let lastCount = 0;
        const startTime = Date.now();
        let retryCount = 0;
        const maxRetries = 3;
        for (let i = 0; i < maxScrolls; i++) {
            if (Date.now() - startTime > CONFIG.LIMITS.MAX_SCROLL_TIMEOUT) {
                console.log('Max scroll timeout reached');
                break;
            }
            const state = getGlobalScriptState();
            if (state.cancelled) {
                console.log('Reply collection cancelled');
                break;
            }
            if (state.paused && state.running) {
                console.log('Reply collection paused');
                while (getGlobalScriptState().paused) {
                    await sleep(500);
                }
                console.log('Reply collection resumed');
            }
            try {
                const articles = Array.from(findElements(SELECTORS.TWEET.ARTICLE));
                if (articles.length === 0) {
                    retryCount++;
                    if (retryCount >= maxRetries) break;
                    await sleep(scrollDelay * 2);
                    continue;
                }
                const originalHandle = (getArticleAuthorHandle(articles[0]) || '').toLowerCase();
                for (let idx = 1; idx < articles.length; idx++) {
                    const art = articles[idx];
                    const author = (getArticleAuthorHandle(art) || '').toLowerCase();
                    if (!author) continue;
                    const isOwner = author === originalHandle;
                    const tweetId = getTweetIdFromArticle(art);
                    // For comment extraction requirement: continue regardless of verification status
                    snapshots.push({
                        idx,
                        tweetId,
                        author,
                        isOwner,
                        timestamp: Date.now()
                    });
                }
                const uniqueCount = new Set(snapshots.map(s => s.tweetId || `${s.author}:${s.idx}`)).size;
                if (uniqueCount === lastCount) {
                    stable++;
                } else {
                    stable = 0;
                    lastCount = uniqueCount;
                    retryCount = 0;
                }
                if (stable >= 3 && i >= 8) {
                    console.log('Reply collection appears stable, stopping');
                    break;
                }
                try {
                    const scrollAmount = Math.min(window.innerHeight, 1500);
                    window.scrollBy(0, scrollAmount);
                } catch (scrollError) {
                    console.warn('Scroll error in reply collection:', scrollError);
                    document.documentElement.scrollTop += 1500;
                }
                await sleep(scrollDelay || randomDelay(1000, 2000));
            } catch (error) {
                console.error('Error in reply collection step:', error);
                retryCount++;
                if (retryCount >= maxRetries) break;
                if (isRateLimited(error)) await handleRateLimit();
                await sleep(randomDelay(2000, 4000));
            }
        }
        if (observer) {
            try {
                observer.disconnect();
                const index = activeObservers.indexOf(observer);
                if (index > -1) activeObservers.splice(index, 1);
            } catch (error) {
                console.warn('Failed to disconnect observer:', error);
            }
        }
        const seen = new Set();
        const uniqueSnapshots = [];
        for (const snapshot of snapshots) {
            const key = snapshot.tweetId || `${snapshot.author}:${snapshot.idx}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueSnapshots.push(snapshot);
            }
        }
        console.log(`Collected ${uniqueSnapshots.length} unique reply snapshots`);
        return uniqueSnapshots;
    }
    // Enhanced reply analysis with detailed metrics
    function analyzeReplies(originalHandle, snapshots, job) {
        const commenters = new Set();
        let ownerComments = 0;
        let otherComments = 0;
        const engagementMetrics = {
            totalReplies: snapshots.length,
            uniqueCommenters: 0,
            ownerEngagementRatio: 0,
            averageRepliesPerCommenter: 0
        };
        for (const snapshot of snapshots) {
            if (!snapshot.author) continue;
            if (snapshot.author === originalHandle) {
                ownerComments++;
            } else {
                otherComments++;
                commenters.add(snapshot.author);
            }
        }
        engagementMetrics.uniqueCommenters = commenters.size;
        if (commenters.size > 0) {
            engagementMetrics.averageRepliesPerCommenter = Math.round((otherComments / commenters.size) * 100) / 100;
        }
        const profileCommentTotal = job.profileCommentTotal || 1;
        let replyGuysPercentage = 0;
        if (profileCommentTotal > 0) {
            replyGuysPercentage = (ownerComments / profileCommentTotal) * 100;
            replyGuysPercentage = Math.round(replyGuysPercentage * 100) / 100;
        }
        engagementMetrics.ownerEngagementRatio = replyGuysPercentage;
        return {
            ownerComments,
            otherComments,
            uniqueCommenters: commenters.size,
            replyGuysPercentage,
            engagementMetrics
        };
    }
    // Enhanced tweet processing with comprehensive error handling
    async function processTweetAllReplies(job) {
        try {
            await until(() => findElements(SELECTORS.TWEET.ARTICLE).length >= 1, { timeout: 45000, interval: 500 });
            await sleep(1500);
            const mainTweet = findElement(SELECTORS.TWEET.ARTICLE);
            if (!mainTweet) {
                throw new Error('Main tweet element not found');
            }
            const originalHandle = (getArticleAuthorHandle(mainTweet) || '').toLowerCase();
            if (!originalHandle) {
                throw new Error('Tweet author could not be determined');
            }
            const snapshots = await collectReplies(job);
            if (!snapshots.length) {
                console.warn('No replies found for tweet');
            }
            const analysisResult = analyzeReplies(originalHandle, snapshots, job);
            const currentState = JSON.parse(sessionStorage.getItem('vm_dom_job') || '{}');
            const updatedState = {
                ...currentState,
                ownerComments: (currentState.ownerComments || 0) + analysisResult.ownerComments,
                otherComments: (currentState.otherComments || 0) + analysisResult.otherComments,
                uniqueCommenters: (currentState.uniqueCommenters || 0) + analysisResult.uniqueCommenters,
                replyGuysPercentage: analysisResult.replyGuysPercentage,
                lastProcessed: Date.now(),
                engagementMetrics: analysisResult.engagementMetrics
            };
            sessionStorage.setItem('vm_dom_job', JSON.stringify(updatedState));
            console.log(`Processed tweet: ${analysisResult.ownerComments} owner, ${analysisResult.otherComments} other comments`);
        } catch (error) {
            console.error('Error processing tweet replies:', error);
            const currentState = JSON.parse(sessionStorage.getItem('vm_dom_job') || '{}');
            currentState.error = error.message || 'Unknown processing error';
            currentState.lastError = Date.now();
            sessionStorage.setItem('vm_dom_job', JSON.stringify(currentState));
        }
    }
    // Enhanced finalization with cleanup
    async function finalizeAndClose(username, runId, resultObj) {
        console.log('Finalizing analysis results:', resultObj);
        try {
            const enhancedResult = {
                ...resultObj,
                completedAt: Date.now(),
                version: '10.2.0',
                hostname: location.hostname
            };
            const success = gm.setValue(`vm_result_${runId}`, enhancedResult);
            if (!success) {
                console.error('Failed to save final results');
            }
        } catch (error) {
            console.error('Error saving final results:', error);
        }
        try {
            sessionStorage.removeItem('vm_dom_job');
        } catch (error) {
            console.warn('Failed to clean up session storage:', error);
        }
        setTimeout(() => {
            try {
                if (window.close) {
                    window.close();
                } else if (window.parent && window.parent.close) {
                    window.parent.close();
                }
                setTimeout(() => {
                    try {
                        if (window.history && window.history.back) {
                            window.history.back();
                        }
                    } catch (navError) {
                        console.warn('Failed to navigate back:', navError);
                    }
                }, 1000);
            } catch (closeError) {
                console.warn('Failed to close window:', closeError);
            }
        }, 300);
    }
    // Enhanced boot logic with extension conflict detection
    function boot() {
        try {
            // Check for potential extension conflicts
            const conflictingExtensions = [
                'TweetDeck',
                'Twitter Enhancement Suite',
                'Social Blade',
                'Chrome Extension'
            ];
            let hasConflicts = false;
            conflictingExtensions.forEach(ext => {
                if (document.documentElement.classList.toString().includes(ext.toLowerCase()) ||
                    document.querySelector(`[data-extension*="${ext.toLowerCase()}"]`)) {
                    console.warn(`Potential conflict detected with: ${ext}`);
                    hasConflicts = true;
                }
            });
            if (hasConflicts) {
                console.warn('Extension conflicts detected - some features may not work properly');
            }
            ensureFab();
            ensurePanelIframe();
            let lastPath = location.pathname;
            setInterval(() => {
                try {
                    if (location.pathname !== lastPath) {
                        lastPath = location.pathname;
                        ensureFab();
                        ensurePanelIframe();
                    }
                } catch (error) {
                    console.warn('Error in path monitoring:', error);
                }
            }, 1000);
            childMainIfNeeded();
            // Initialize cross-tab communication
            window.addEventListener('storage', (e) => {
                if (e.key === 'la_broadcast') {
                    try {
                        const message = JSON.parse(e.newValue || '{}');
                        broadcastMessage(message);
                    } catch (error) {
                        console.warn('Failed to handle broadcast message:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Boot error:', error);
        }
    }
    // Enhanced initialization with comprehensive error handling
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', boot, { once: true });
        } else {
            boot();
        }
        // Global error handler for unhandled promises
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            event.preventDefault();
        });
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            cleanupResources();
        });
        // Performance monitoring
        if (window.performance && window.performance.mark) {
            window.performance.mark('la-script-loaded');
        }
    } catch (initError) {
        console.error('Initialization error:', initError);
    }
})();
