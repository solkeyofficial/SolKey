
export function scopeAllowed(required, granted) {
  return granted.includes(required) || granted.includes("*");
}
