import {verificationLogoBase64} from "./verification-logo";
import type { AccountRecord, Env } from "./types";

type EmailAddressInput = string | { email: string; name: string };
type MailLanguage = 'en' | 'fr' | 'ar';
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
  const verification=verificationCodeCopy[language];
  const attachLogo=transport==="OUTLOOK_GRAPH"||transport==="GMAIL_API";
  await deliverAuthEmail(env,transport,{
    inlineLogo:attachLogo,to:account.email,from:parseEmailAddress(sender),subject:verification.subject,
    html:renderVerificationEmail(language,token,attachLogo),
    text:['Distilled.News','',verification.heading,'',verification.instructions,'',token,'',verification.expires,'',verification.footer].join("\n")
  });
}

const verificationCodeCopy={
  en:{
    subject:'Your Distilled.News verification code',
    heading:'Verify your email address',
    instructions:'To complete your sign-up or sign-in, enter the verification code below.',
    expires:'Valid for 24 hours',
    footer:"If you didn't request this email, you can safely ignore it."
  },
  fr:{
    subject:'Votre code de vérification Distilled.News',
    heading:'Vérifiez votre adresse e-mail',
    instructions:'Pour terminer votre inscription ou votre connexion, saisissez le code de vérification ci-dessous.',
    expires:'Valable pendant 24 heures',
    footer:'Si vous n’avez pas demandé cet e-mail, vous pouvez l’ignorer.'
  },
  ar:{
    subject:'رمز التحقق لحساب Distilled.News',
    heading:'أكّد بريدك الإلكتروني',
    instructions:'لإكمال التسجيل أو تسجيل الدخول، أدخل هذا الرمز أدناه.',
    expires:'صالح لمدة ٢٤ ساعة',
    footer:'إذا لم تطلب هذه الرسالة، يمكنك تجاهلها.'
  }
};

function renderVerificationEmail(language:MailLanguage,code:string,inlineLogo:boolean):string {
  const copy=verificationCodeCopy[language];
  return `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#FFFFFF" style="background:#FFFFFF;">
<tr><td align="center" style="padding:16px 12px;">
<!--[if mso]><table role="presentation" width="560" align="center" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<table role="presentation" width="100%" align="center" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;">
<tr><td lang="${language}" dir="${language==='ar'?'rtl':'ltr'}" align="center" style="padding:20px 8px;font-family:Arial,Helvetica,sans-serif;color:#11112F;text-align:center;">
<table role="presentation" dir="ltr" align="center" cellspacing="0" cellpadding="0"><tr>
${inlineLogo?'<td valign="middle" style="padding-right:8px;"><img src="cid:distilled-verification-logo" width="44" height="22" alt="" style="display:block;border:0;"></td>':''}
<td valign="middle" style="font:bold 22px/28px Arial,Helvetica,sans-serif;color:#11112F;">Distilled.<span style="color:#5E5CE6;">News</span></td>
</tr></table>
<h1 style="margin:25px 0 12px;font-size:24px;line-height:30px;color:#11112F;">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#55566B;">${escapeHtml(copy.instructions)}</p>
<table role="presentation" width="100%" align="center" cellspacing="0" cellpadding="0" style="max-width:400px;"><tr>
<td dir="ltr" align="center" bgcolor="#F5F3FF" style="padding:16px 8px;background:#F5F3FF;border-radius:8px;color:#11112F;font:bold 20px/27px Arial,Helvetica,sans-serif;letter-spacing:.5px;overflow-wrap:anywhere;">${escapeHtml(code)}</td>
</tr></table>
<p style="margin:10px 0 20px;font-size:14px;line-height:20px;color:#55566B;">${escapeHtml(copy.expires)}</p>
<p style="margin:0;padding-top:14px;border-top:1px solid #ECE8F5;font-size:13px;line-height:19px;color:#55566B;">${escapeHtml(copy.footer)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`;
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
    html: [
      `<div lang="${input.language}" dir="${input.language === 'ar' ? 'rtl' : 'ltr'}" style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #202124; font-size: 16px;">`,
      `<table role="presentation" dir="ltr" cellpadding="0" cellspacing="0" style="margin-bottom:24px;direction:ltr;"><tr><td><img src="${escapeHtml(logoUrl)}" alt="" width="80" height="40" style="display:block;border:0;" /></td><td style="padding-left:12px;font-size:24px;font-weight:700;">Distilled.News</td></tr></table>`,
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

type AuthMessage={to:string;from:EmailAddressInput;subject:string;text:string;html?:string;inlineLogo?:boolean};
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
  const alternative=crypto.randomUUID(),related=crypto.randomUUID();
  const html=message.html
    ? message.inlineLogo
      ? [`Content-Type: multipart/related; boundary="${related}"; type="text/html"`,"",
        `--${related}`,...part("text/html",message.html),
        `--${related}`,"Content-Type: image/png","Content-Transfer-Encoding: base64",
        "Content-ID: <distilled-verification-logo>",'Content-Disposition: inline; filename="email-logo.png"',"",
        wrap(verificationLogoBase64),`--${related}--`]
      : part("text/html",message.html)
    : undefined;
  return utf8([
    `From: Distilled.News <${from}>`,`To: <${message.to}>`,`Subject: ${encodeHeader(message.subject)}`,"MIME-Version: 1.0",
    ...(html?[`Content-Type: multipart/alternative; boundary="${alternative}"`,"",
      `--${alternative}`,...part("text/plain",message.text),`--${alternative}`,...html,`--${alternative}--`]
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
  const sendResponse = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { ...authorization, "content-type": message.inlineLogo ? "text/plain" : "application/json" },
    body: message.inlineLogo ? encodeMimeEmail(message) : JSON.stringify({
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
