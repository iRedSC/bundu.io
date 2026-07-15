export class ReversableMap<K, V> extends Map<K, V> {
    _valueMap: Map<V, K>;

    constructor() {
        super();
        this._valueMap = new Map();
    }

    override set(key: K, value: V) {
        if (this._valueMap.has(value) && !Object.is(this._valueMap.get(value), key)) {
            throw new Error("Value already exists in map.");
        }

        if (this.has(key)) {
            const oldValue = this.get(key) as V;
            if (!Object.is(oldValue, value)) {
                this._valueMap.delete(oldValue);
            }
        }

        super.set(key, value);
        this._valueMap.set(value, key);
        return this;
    }

    getv(value: V) {
        return this._valueMap.get(value);
    }

    override delete(key: K) {
        if (!this.has(key)) {
            return false;
        }
        const value = this.get(key);
        super.delete(key);
        this._valueMap.delete(value as V);
        return true;
    }

    deletev(value: V) {
        if (!this._valueMap.has(value)) {
            return false;
        }
        const key = this._valueMap.get(value);
        return this.delete(key as K);
    }

    hasv(value: V) {
        return this._valueMap.has(value);
    }

    override clear() {
        super.clear();
        this._valueMap.clear();
    }
}
