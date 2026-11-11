/** Safe frontend error state. No locale or arbitrary server prose is stored. */
export const apiErrorCopy = {
  REQUEST_FAILED: ['Could not complete the request. Try again.', 'Impossible de terminer la demande. Réessayez.', 'تعذّر إكمال الطلب. حاول مجددًا.'],
  AUTH_EMAIL_VERIFICATION_REQUIRED: ['Verify your email before logging in.', 'Vérifiez votre adresse e-mail avant de vous connecter.', 'تحقّق من بريدك الإلكتروني قبل تسجيل الدخول.'],
  AUTH_INVALID_CREDENTIALS: ['Invalid email or password.', 'Adresse e-mail ou mot de passe incorrect.', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'],
  AUTH_VERIFICATION_FAILED: ['Complete the verification check and try again.', 'Effectuez la vérification, puis réessayez.', 'أكمل التحقّق ثم حاول مجددًا.'],
  AUTH_TOKEN_INVALID: ['Invalid or expired token', 'Ce lien est invalide ou a expiré. Demandez un nouveau lien.', 'هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.'],
  AUTH_INVALID_CURRENT_PASSWORD: ['Invalid current password.', 'Le mot de passe actuel est incorrect.', 'كلمة المرور الحالية غير صحيحة.'],
  AUTH_EMAIL_REGISTERED: ['Email is already registered. Sign in or reset your password.', 'Cette adresse e-mail est déjà inscrite. Connectez-vous ou réinitialisez votre mot de passe.', 'البريد الإلكتروني مسجّل بالفعل. سجّل الدخول أو أعد تعيين كلمة المرور.'],
  AUTH_USERNAME_TAKEN: ['Username is already taken. Choose another username.', 'Ce nom d’utilisateur est déjà utilisé. Choisissez-en un autre.', 'اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر.'],
  AUTH_TOO_MANY_ATTEMPTS: ['Too many attempts. Wait before trying again.', 'Trop de tentatives. Patientez avant de réessayer.', 'محاولات كثيرة. انتظر قبل المحاولة مجددًا.'],
  AUTH_INVALID_SETUP_TOKEN: ['Invalid setup token. Check the token supplied by the site owner.', 'Jeton de configuration invalide. Vérifiez celui fourni par le propriétaire du site.', 'رمز الإعداد غير صالح. تحقّق من الرمز الذي قدّمه مالك الموقع.'],
  AUTH_SETUP_COMPLETE: ['Setup is already complete. Sign in instead.', 'La configuration est déjà terminée. Connectez-vous.', 'اكتمل الإعداد بالفعل. سجّل الدخول.'],
  AUTH_EMAIL_SEND_FAILED: ['Could not send the verification email. Try again later.', 'Impossible d’envoyer l’e-mail de vérification. Réessayez plus tard.', 'تعذّر إرسال رسالة التحقّق. حاول لاحقًا.'],
  AUTH_SIGN_IN_REQUIRED: ['Sign in to continue.', 'Connectez-vous pour continuer.', 'سجّل الدخول للمتابعة.'],
  SOURCE_RECOMMENDATIONS_DISABLED: ['Source recommendations are not enabled on this deployment.', 'Les suggestions de sources ne sont pas activées sur ce site.', 'اقتراحات المصادر غير مفعّلة على هذا الموقع.'],
  SOURCE_RECOMMENDATIONS_INTERRUPTED: ['Source recommendations were interrupted. Please try again.', 'Les suggestions de sources ont été interrompues. Réessayez.', 'انقطعت اقتراحات المصادر. حاول مجددًا.'],
  SOURCE_RECOMMENDATIONS_LIMIT: ['You can request AI source recommendations three times every five hours. Please try again later, or add a source URL directly.', 'Vous pouvez demander des suggestions de sources trois fois toutes les cinq heures. Réessayez plus tard ou ajoutez directement un lien.', 'يمكنك طلب اقتراحات المصادر ثلاث مرات كل خمس ساعات. حاول لاحقًا أو أضف رابط المصدر مباشرة.'],
  FEED_NAME_TOO_LONG: ['Use {max} characters or fewer for the feed name.', 'Utilisez au maximum {max} caractères pour le nom du fil.', 'استخدم {max} حرفًا أو أقل لاسم الخلاصة.']
} as const;
export type ApiErrorId = keyof typeof apiErrorCopy;
export interface SafeErrorDetails { readonly status?: number; readonly retryAfterSeconds?: number; readonly max?: number }
export interface ApiErrorMessage { readonly id: ApiErrorId; readonly details: SafeErrorDetails }
export type UiMessage = string | ApiErrorMessage;
const knownErrors: Record<string, ApiErrorId> = {
  'verify your email before logging in': 'AUTH_EMAIL_VERIFICATION_REQUIRED',
  'invalid email or password': 'AUTH_INVALID_CREDENTIALS',
  'verification failed': 'AUTH_VERIFICATION_FAILED',
  'invalid or expired token': 'AUTH_TOKEN_INVALID',
  'invalid current password': 'AUTH_INVALID_CURRENT_PASSWORD',
  'email is already registered': 'AUTH_EMAIL_REGISTERED',
  'username is already taken': 'AUTH_USERNAME_TAKEN',
  'too many attempts': 'AUTH_TOO_MANY_ATTEMPTS',
  'invalid setup token': 'AUTH_INVALID_SETUP_TOKEN',
  'setup is already complete': 'AUTH_SETUP_COMPLETE',
  'could not send verification email': 'AUTH_EMAIL_SEND_FAILED',
  'unauthorized': 'AUTH_SIGN_IN_REQUIRED',
  'source recommendations are not enabled on this deployment.': 'SOURCE_RECOMMENDATIONS_DISABLED',
  'source recommendations were interrupted. please try again.': 'SOURCE_RECOMMENDATIONS_INTERRUPTED',
  'you can request ai source recommendations three times every five hours. please try again later, or add a source url directly.': 'SOURCE_RECOMMENDATIONS_LIMIT'
};
export class ApiError extends Error {
  readonly uiMessage: ApiErrorMessage;
  constructor(readonly id: ApiErrorId, details: SafeErrorDetails = {}) {
    super(id); this.name = 'ApiError';
    // Whitelist bounded numeric metadata; never retain server text or arbitrary fields.
    this.uiMessage = Object.freeze({id, details: Object.freeze({
      ...(Number.isInteger(details.status) && details.status! >= 100 && details.status! <= 599 ? {status:details.status} : {}),
      ...(Number.isInteger(details.retryAfterSeconds) && details.retryAfterSeconds! >= 0 && details.retryAfterSeconds! <= 86400 ? {retryAfterSeconds:details.retryAfterSeconds} : {})
    })});
  }
}
export function apiError(detail: unknown, response?: Response): ApiError {
  const key = typeof detail === 'string' ? detail.trim().toLowerCase() : '';
  const id = Object.prototype.hasOwnProperty.call(knownErrors, key) ? knownErrors[key] : 'REQUEST_FAILED';
  const retry = response?.headers.get('retry-after');
  return new ApiError(id, {status:response?.status, ...(retry && /^\d+$/.test(retry) ? {retryAfterSeconds:Number(retry)} : {})});
}
/** Existing trusted local copy stays a key; API errors keep structured safe data. */
export function toUiError(cause: unknown): UiMessage {
  return cause instanceof ApiError ? cause.uiMessage : cause instanceof Error ? cause.message : String(cause);
}
export function renderApiError(message: ApiErrorMessage, language: 'en'|'fr'|'ar'): string {
  const copy = apiErrorCopy[message.id][language === 'en' ? 0 : language === 'fr' ? 1 : 2];
  return copy.replace(/\{max\}/g, String(message.details.max ?? ''));
}
