export class ReversableMap<K, V> extends Map {
    _valueMap: Map<V, K>;

    constructor() {
        super();
        this._valueMap = new Map();
    }

    override set(key: K, value: V) {
        if (this._valueMap.get(value)) {
            throw "Value already exists in map.";
        }

        super.set(key, value);
        this._valueMap.set(value, key);
        return this;
    }

    getv(value: V) {
        return this._valueMap.get(value);
    }

    override delete(key: K) {
        const value = this.get(key);
        if (value === undefined) {
            return false;
        }
        this.delete(key);
        this._valueMap.delete(value);
        return true;
    }

    deletev(value: V) {
        const key = this._valueMap.get(value);
        if (key === undefined) {
            return false;
        }
        return this.delete(key);
    }

    hasv(value: V) {
        return this._valueMap.has(value);
    }
}
