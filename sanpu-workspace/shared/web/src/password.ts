/** Same rules as the API (Core.Domain PasswordPolicy): easy to remember, still not trivial. */
export const PASSWORD_MIN = 8;
export const PASSWORD_HINT = "At least 8 characters with upper and lower case letters and a digit.";
export function passwordProblems(password: string, email?: string): string[] {
  const out: string[] = [];
  if (!password) return ["Password is required."];
  if (password.length < PASSWORD_MIN) out.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > 128) out.push("Use at most 128 characters.");
  if (!/[A-Z]/.test(password)) out.push("Add an upper-case letter.");
  if (!/[a-z]/.test(password)) out.push("Add a lower-case letter.");
  if (!/\d/.test(password)) out.push("Add a digit.");
  const local = email?.split("@")[0];
  if (local && local.length >= 3 && password.toLowerCase().includes(local.toLowerCase())) out.push("Do not use your email name in the password.");
  return out;
}
