let cacheStore = new Map();

function getCache(key) {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (entry.expireAt && entry.expireAt < now) {
        cacheStore.delete(key);
        return null;
    }
    return entry.value;
}

function setCache(key, value, ttlSeconds = 60) {
    const expireAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    cacheStore.set(key, { value, expireAt });
}

function clearCachePrefix(prefix) {
    for (const key of cacheStore.keys()) {
        if (key.startsWith(prefix)) {
            cacheStore.delete(key);
        }
    }
}

module.exports = { getCache, setCache, clearCachePrefix };

