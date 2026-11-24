export function usernameValidationKey(username: string) {
  const value = username.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
  if ([...value].length < 1 || [...value].length > 32) return "login.usernameLength";
  if (/[\p{Cc}\p{White_Space}]/u.test(value)) return "login.usernamePattern";
  return "";
}
