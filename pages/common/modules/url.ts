
/**
 * Sets a URL parameter.
 * @param key
 * @param value If `null` the parameter is deleted.
 */
export function setURLParam(key: string, value: string|null) {
    const url = new URL(window.location.href); 
    if (value)
        url.searchParams.set(key, value);
    else
        url.searchParams.delete(key);

    window.history.replaceState({}, '', url.toString());
}
