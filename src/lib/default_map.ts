export class DefaultMap<K, V> extends Map<K, V> {
    defaultValue: () => V;

    constructor(defaultValue: () => V) {
        super();
        this.defaultValue = defaultValue;
    }

    override get(key: K): V {
        const result = super.get(key);
        if (!result) {
            const value = this.defaultValue();
            this.set(key, value);
            return value;
        }
        return result;
    }
}
