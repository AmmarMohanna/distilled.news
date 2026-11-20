import type { MouseEvent } from 'react';
import { renderApiError } from './api-errors';

export function VerifiedEmailError({ language, onNavigate }: {
  language: 'en' | 'fr' | 'ar';
  onNavigate: (mode: 'login' | 'forgot') => void;
}) {
  const text = renderApiError({ id: 'AUTH_EMAIL_ALREADY_VERIFIED', details: {} }, language);
  const labels = language === 'ar' ? ['تسجيل الدخول', 'إعادة تعيين كلمة المرور']
    : language === 'fr' ? ['vous connecter', 'réinitialiser votre mot de passe'] : ['sign in', 'reset your password'];
  const signIn = text.indexOf(labels[0]), reset = text.indexOf(labels[1]);
  function navigate(event: MouseEvent<HTMLAnchorElement>, mode: 'login' | 'forgot') {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(mode);
  }
  return <>{text.slice(0, signIn)}
    <a className="auth-error-action" href="/login" onClick={event => navigate(event, 'login')}>{labels[0]}</a>
    {text.slice(signIn + labels[0].length, reset)}
    <a className="auth-error-action" href="/login?reset-password" onClick={event => navigate(event, 'forgot')}>{labels[1]}</a>
    {text.slice(reset + labels[1].length)}
  </>;
}
