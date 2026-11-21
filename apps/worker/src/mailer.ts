import type { AccountRecord, Env } from "./types";
import { verificationLogoBase64 } from "./verification-logo";

type EmailAddressInput = string | { email: string; name: string };
type MailLanguage = 'en' | 'fr' | 'ar';
const authBrandPurple = '#5B55EB';
const authWordmarkFont = "bold 25px/32px Georgia,'Times New Roman',serif";
const authWordmark = `Distilled<span style="color:${authBrandPurple};">.</span>News`;
const mailCopy = {
  en: {
    verifySubject: 'Verify your email for Distilled.News', verifyAction: 'Verify email',
    verifyText: 'Verify your email to finish setting up your Distilled.News account.', verifyExpires: 'This verification link expires in 24 hours.',
    resetSubject: 'Reset your Distilled.News password', resetAction: 'Reset password',
    resetText: 'Use this link to choose a new Distilled.News password.', resetExpires: 'This reset link expires in 30 minutes.',
    footer: 'If you did not request this email, you can ignore it.'
  },
  fr: {
    verifySubject: 'Vérifiez votre adresse e-mail pour Distilled.News', verifyAction: 'Vérifier mon adresse e-mail',
    verifyText: 'Vérifiez votre adresse e-mail pour terminer la création de votre compte Distilled.News.', verifyExpires: 'Ce lien de vérification expire dans 24 heures.',
    resetSubject: 'Réinitialisez votre mot de passe Distilled.News', resetAction: 'Réinitialiser le mot de passe',
    resetText: 'Utilisez ce lien pour choisir un nouveau mot de passe Distilled.News.', resetExpires: 'Ce lien de réinitialisation expire dans 30 minutes.',
    footer: 'Si vous n’avez pas demandé cet e-mail, vous pouvez l’ignorer.'
  },
  ar: {
    verifySubject: 'تأكيد بريدك الإلكتروني لحساب Distilled.News', verifyAction: 'تأكيد البريد الإلكتروني',
    verifyText: 'أكّد بريدك الإلكتروني لإكمال إنشاء حسابك في Distilled.News.', verifyExpires: 'تنتهي صلاحية رابط التأكيد خلال ٢٤ ساعة.',
    resetSubject: 'إعادة تعيين كلمة مرور حسابك في Distilled.News', resetAction: 'إعادة تعيين كلمة المرور',
    resetText: 'استخدم هذا الرابط لاختيار كلمة مرور جديدة لحسابك في Distilled.News.', resetExpires: 'تنتهي صلاحية رابط إعادة التعيين خلال ٣٠ دقيقة.',
    footer: 'إذا لم تطلب هذه الرسالة، يمكنك تجاهلها.'
  }
};

export async function sendVerificationEmail(env: Env, account: AccountRecord, token: string, language: MailLanguage = 'en'): Promise<void> {
  const copy = mailCopy[language];
  if(env.ENVIRONMENT==='staging'&&env.AGENTOPS_CAMPAIGN_ENABLED==='true'&&env.AGENTOPS_CAMPAIGN_ISOLATED==='true'){
    await sendAuthEmail(env,{verification:true,to:account.email,language,subject:copy.verifySubject,
      path:`/verify-email?token=${encodeURIComponent(token)}&lang=${language}`,action:copy.verifyAction,
      text:copy.verifyText,expires:copy.verifyExpires});
    return;
  }
  const transport=env.VERIFICATION_MAIL_TRANSPORT??env.MAIL_TRANSPORT;
  const sender=transport==='GMAIL_API'?env.GMAIL_FROM:env.EMAIL_FROM;
  if(!sender)throw new Error('Verification sender is not configured');
  const verification = verificationLinkCopy[language];
  const url = new URL('/verify-email', env.PUBLIC_WEB_BASE_URL || 'https://distilled.news');
  url.searchParams.set('token', token);
  url.searchParams.set('lang', language);
  const message = {
    to: account.email, from: parseEmailAddress(sender), subject: copy.verifySubject,
    text: ['Distilled.News', '', verification.heading, '', verification.instructions, '',
      `${copy.verifyAction}: ${url}`, '', verification.expires, '', copy.footer].join("\n")
  };
  if (transport !== "OUTLOOK_GRAPH" && transport !== "GMAIL_API") {
    const logoId = "distilled-verification-logo";
    await deliverAuthEmail(env, transport, {
      ...message,
      html: renderVerificationEmail(language, url.toString(), logoId),
      attachments: [{
        filename: "email-logo.png",
        content: decodeBase64(verificationLogoBase64).buffer,
        type: "image/png",
        disposition: "inline",
        contentId: logoId
      }]
    });
    return;
  }
  await deliverAuthEmail(env, transport, message);
}

const verificationLinkCopy = {
  en:{
    heading:'Verify your email',
    instructions:'Confirm your email address to complete your sign-up and get started with Distilled.News.',
    expires:'Valid for 24 hours'
  },
  fr:{
    heading:'Vérifiez votre adresse e-mail',
    instructions:'Pour terminer la création de votre compte, ouvrez le lien ci-dessous et confirmez votre adresse e-mail.',
    expires:'Valable pendant 24 heures'
  },
  ar:{
    heading:'أكّد بريدك الإلكتروني',
    instructions:'لإكمال إنشاء حسابك، افتح الرابط أدناه وأكّد بريدك الإلكتروني.',
    expires:'صالح لمدة ٢٤ ساعة'
  }
};

function renderVerificationEmail(language: MailLanguage, url: string, logoId: string): string {
  const copy = verificationLinkCopy[language];
  const { verifyAction, footer } = mailCopy[language];
  const rtl = language === 'ar';
  const purple = authBrandPurple;
  const escapedUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="${language}">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
@media screen and (min-width:481px) {
  .dn-frame { padding-top:24px !important; }
  .dn-content { padding:16px 8px 20px !important; }
  .dn-heading { margin-top:24px !important; font-size:34px !important; line-height:42px !important; }
  .dn-description { margin-bottom:22px !important; }
}
@media screen and (max-width:480px) {
  .dn-frame { padding:8px 16px 16px !important; }
  .dn-content { padding:4px 0 8px !important; }
  .dn-logo { width:36px !important; height:18px !important; }
  .dn-wordmark { font-size:23px !important; line-height:29px !important; }
  .dn-heading { margin:16px 0 8px !important; font-size:27px !important; line-height:34px !important; }
  .dn-description { margin-bottom:16px !important; font-size:15px !important; line-height:22px !important; }
  .dn-button-label { padding:11px 14px !important; font-size:17px !important; line-height:24px !important; }
  .dn-expiry { margin:10px 0 14px !important; }
  .dn-footer { margin-top:12px !important; }
}
@media screen and (max-width:280px) {
  .dn-frame { padding-left:12px !important; padding-right:12px !important; }
  .dn-wordmark { font-size:20px !important; line-height:26px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;">
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="color:inherit;">
<tr><td class="dn-frame" align="center" style="padding:14px 16px 24px;">
<!--[if mso]><table role="presentation" width="560" align="center" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<table role="presentation" width="100%" align="center" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;">
<tr><td class="dn-content" lang="${language}" dir="${rtl ? 'rtl' : 'ltr'}" align="center" style="padding:8px 4px 20px;font-family:Arial,Helvetica,sans-serif;color:inherit;text-align:center;">
<table role="presentation" dir="ltr" align="center" cellspacing="0" cellpadding="0"><tr>
<td valign="middle" style="padding-right:8px;"><img class="dn-logo" src="cid:${logoId}" width="44" height="22" alt="" style="display:block;border:0;"></td>
<td class="dn-wordmark" valign="middle" style="font:${authWordmarkFont};">${authWordmark}</td>
</tr></table>
<h1 class="dn-heading" style="margin:22px 0 10px;font-size:32px;line-height:40px;">${escapeHtml(copy.heading)}</h1>
<p class="dn-description" style="margin:0 auto 20px;max-width:410px;font-size:16px;line-height:24px;">${escapeHtml(copy.instructions)}</p>
<!--[if mso]><table role="presentation" width="288" align="center" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<table role="presentation" width="100%" align="center" cellspacing="0" cellpadding="0" style="width:100%;max-width:288px;"><tr>
<td class="dn-button" align="center" bgcolor="${purple}" style="background-color:${purple};border-radius:14px;mso-padding-alt:14px 18px;"><a class="dn-button-label" href="${escapedUrl}" style="display:block;padding:14px 18px;mso-padding-alt:0;color:#FFFFFF;font:bold 18px/24px Arial,Helvetica,sans-serif;text-decoration:none;">${escapeHtml(verifyAction)}&nbsp; <span aria-hidden="true">${rtl ? '←' : '→'}</span></a></td>
</tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p dir="ltr" style="margin:12px 0 0;font-size:14px;line-height:21px;word-break:break-all;"><a href="${escapedUrl}">${escapedUrl}</a></p>
<p class="dn-expiry" style="margin:12px 0 18px;font-size:14px;line-height:21px;">${escapeHtml(copy.expires)}</p>
<table class="dn-divider" role="presentation" width="75%" align="center" cellspacing="0" cellpadding="0" aria-hidden="true" style="width:75%;max-width:376px;"><tr>
<td height="1" style="border-top:1px solid ${purple};font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td>
</tr></table>
<p class="dn-footer" style="margin:14px 0 0;font-size:13px;line-height:20px;">${escapeHtml(footer)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

export async function sendPasswordResetEmail(env: Env, account: AccountRecord, token: string, language: MailLanguage = 'en'): Promise<void> {
  const copy = mailCopy[language];
  await sendAuthEmail(env, {
    to: account.email,
    language,
    subject: copy.resetSubject,
    path: `/reset-password?token=${encodeURIComponent(token)}&lang=${language}`,
    action: copy.resetAction,
    text: copy.resetText,
    expires: copy.resetExpires
  });
}

async function sendAuthEmail(
  env: Env,
  input: {
    verification?: true;
    to: string;
    subject: string;
    path: string;
    action: string;
    text: string;
    expires: string;
    language: MailLanguage;
  }
): Promise<void> {
  const transport = (input.verification ? env.VERIFICATION_MAIL_TRANSPORT : undefined) ?? env.MAIL_TRANSPORT;
  const sender = transport === "GMAIL_API" ? env.GMAIL_FROM : env.EMAIL_FROM;
  if (!sender) throw new Error(transport === "GMAIL_API" ? "GMAIL_FROM is not configured" : "EMAIL_FROM is not configured");

  const url = new URL(input.path, env.PUBLIC_WEB_BASE_URL || "https://distilled.news").toString();
  const logoUrl = new URL('/email-logo.png', url).toString();
  const footer = mailCopy[input.language].footer;
  const message = {
    to: input.to,
    from: parseEmailAddress(sender),
    subject: input.subject,
    text: [
      "Distilled.News",
      "",
      input.text,
      "",
      `${input.action}: ${url}`,
      "",
      input.expires,
      footer
    ].join("\n"),
    html: input.verification ? undefined : [
      `<div lang="${input.language}" dir="${input.language === 'ar' ? 'rtl' : 'ltr'}" style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #202124; font-size: 16px;">`,
      `<table role="presentation" dir="ltr" cellpadding="0" cellspacing="0" style="margin-bottom:24px;direction:ltr;"><tr><td><img src="${escapeHtml(logoUrl)}" alt="" width="80" height="40" style="display:block;border:0;" /></td><td style="padding-left:12px;font:${authWordmarkFont};">${authWordmark}</td></tr></table>`,
      `<p>${escapeHtml(input.text)}</p>`,
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td bgcolor="#5e5ce6" style="border-radius:999px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;border:1px solid #5e5ce6;border-radius:999px;background-color:#5e5ce6;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(input.action)}</a></td></tr></table>`,
      `<p dir="ltr" style="word-break: break-all;"><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
      `<p>${escapeHtml(input.expires)}</p>`,
      `<p>${escapeHtml(footer)}</p>`,
      "</div>"
    ].join("")
  };
  await deliverAuthEmail(env,transport,message);
}

type AuthMessage = {
  to: string;
  from: EmailAddressInput;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: ArrayBuffer;
    type: string;
    disposition: "inline";
    contentId: string;
  }>;
};
async function deliverAuthEmail(env:Env,transport:Env['VERIFICATION_MAIL_TRANSPORT'],message:AuthMessage){
  if (transport === "GMAIL_API") {
    await sendGmailEmail(env, message);
    return;
  }
  if (transport === "OUTLOOK_GRAPH") {
    await sendOutlookEmail(env, message);
    return;
  }
  if (!env.EMAIL) throw new Error("Cloudflare Email binding is not configured");
  await env.EMAIL.send(message);
}

function encodeMimeEmail(message:AuthMessage):string {
  const from=typeof message.from==="string"?message.from:message.from.email;
  const mailbox=/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9.-]+$/i;
  if(![from,message.to].every(value=>mailbox.test(value)&&!/[\r\n]/.test(value)))
    throw new Error("MIME email requires a single valid sender and recipient address");
  const utf8=(value:string)=>encodeBase64(new TextEncoder().encode(value));
  const wrap=(value:string)=>value.match(/.{1,76}/g)?.join("\r\n")??"";
  const encodeHeader=(value:string)=>{
    const chunks:string[]=[];
    let chunk="";
    for(const character of value){
      if(new TextEncoder().encode(chunk+character).length>42){chunks.push(chunk);chunk="";}
      chunk+=character;
    }
    if(chunk)chunks.push(chunk);
    return chunks.map(text=>`=?UTF-8?B?${utf8(text)}?=`).join("\r\n ");
  };
  const part=(type:string,body:string)=>[`Content-Type: ${type}; charset=UTF-8`,"Content-Transfer-Encoding: base64","",wrap(utf8(body.replace(/\r?\n/g,"\r\n")))];
  const alternative=crypto.randomUUID();
  return utf8([
    `From: Distilled.News <${from}>`,`To: <${message.to}>`,`Subject: ${encodeHeader(message.subject)}`,"MIME-Version: 1.0",
    ...(message.html?[`Content-Type: multipart/alternative; boundary="${alternative}"`,"",
      `--${alternative}`,...part("text/plain",message.text),`--${alternative}`,...part("text/html",message.html),`--${alternative}--`]
      : part("text/plain",message.text)),
    ""
  ].join("\r\n"));
}

async function sendGmailEmail(
  env: Env,
  message: AuthMessage
): Promise<void> {
  const clientId = env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Gmail mail is not configured");

  const from = typeof message.from === "string" ? message.from : message.from.email;
  const raw = encodeMimeEmail(message).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      grant_type: "refresh_token", refresh_token: refreshToken
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Gmail token exchange failed (${response.status})`);
  const tokens = await response.json() as { access_token?: unknown };
  if (typeof tokens.access_token !== "string" || !tokens.access_token) {
    throw new Error("Gmail token exchange returned incomplete credentials");
  }
  const send = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(from)}/messages/send`, {
    method: "POST",
    redirect: "error",
    headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!send.ok) throw new Error(`Gmail mail submission failed (${send.status})`);
}

async function sendOutlookEmail(
  env: Env,
  message: AuthMessage
): Promise<void> {
  const clientId = env.OUTLOOK_CLIENT_ID?.trim();
  const bootstrapToken = env.OUTLOOK_REFRESH_TOKEN?.trim();
  const encryptionKey = env.OUTLOOK_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !bootstrapToken || !encryptionKey || !env.DB) {
    throw new Error("Outlook mail is not configured");
  }
  const from = typeof message.from === "string" ? message.from : message.from.email;
  const current = await env.DB.prepare(
    "SELECT version, iv, ciphertext FROM mail_oauth_tokens WHERE provider = 'outlook'"
  ).first<{ version: number; iv: string; ciphertext: string }>();
  const refreshToken = current
    ? await decryptToken(current.iv, current.ciphertext, encryptionKey)
    : bootstrapToken;
  const response = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "offline_access Mail.Send User.Read"
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Outlook token exchange failed (${response.status})`);
  const tokens = await response.json() as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token || !tokens.refresh_token) throw new Error("Outlook token exchange returned incomplete credentials");
  const encrypted = await encryptToken(tokens.refresh_token, encryptionKey);
  const saved = await env.DB.prepare(`INSERT INTO mail_oauth_tokens (provider, version, iv, ciphertext, updated_at)
    VALUES ('outlook', 1, ?, ?, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET version = mail_oauth_tokens.version + 1,
      iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at
    WHERE mail_oauth_tokens.version = ?`)
    .bind(encrypted.iv, encrypted.ciphertext, current?.version ?? 0).run();
  if (!saved.success) throw new Error("Outlook token persistence failed");

  const authorization = { authorization: `Bearer ${tokens.access_token}` };
  const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: authorization,
    signal: AbortSignal.timeout(10_000)
  });
  if (!profileResponse.ok) throw new Error(`Outlook mailbox lookup failed (${profileResponse.status})`);
  const profile = await profileResponse.json() as { mail?: string; userPrincipalName?: string };
  const sender = from.trim().toLowerCase();
  if (![profile.mail, profile.userPrincipalName].some(value => value?.trim().toLowerCase() === sender)) {
    throw new Error("Connected Outlook mailbox does not match EMAIL_FROM");
  }
  const plainTextOnly = message.html === undefined;
  const sendResponse = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { ...authorization, "content-type": plainTextOnly ? "text/plain" : "application/json" },
    body: plainTextOnly ? encodeMimeEmail(message) : JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: message.html ? "HTML" : "Text", content: message.html ?? message.text },
        toRecipients: [{ emailAddress: { address: message.to } }]
      },
      saveToSentItems: true
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (sendResponse.status !== 202) throw new Error(`Outlook mail submission failed (${sendResponse.status})`);
}

async function importTokenKey(secret: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < 32) throw new Error("Outlook token encryption key is too short");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(value: string, secret: string): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, await importTokenKey(secret), new TextEncoder().encode(value)
  ));
  return { iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext) };
}

async function decryptToken(iv: string, ciphertext: string, secret: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv) },
    await importTokenKey(secret),
    decodeBase64(ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

function encodeBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function parseEmailAddress(value: string): EmailAddressInput {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s*<([^<>]+)>$/);
  if (!match) return trimmed;
  return { email: match[2].trim(), name: match[1].trim().replace(/^"|"$/g, "") };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
