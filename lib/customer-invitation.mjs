// Public URL plus human-readable instructions only.
// No tokens, contact IDs, company IDs, passwords, or customer PII in the URL.
export function makeCustomerInvitation({origin, email, locationName, language}) {
 const lang=language==="es"?"es":"en";
 const cleanEmail=String(email||"").trim().toLowerCase();
 const cleanLocation=String(locationName||"").trim();
 const url=new URL("/customer-login",origin);
 url.searchParams.set("mode","create");
 url.searchParams.set("lang",lang);
 if(url.protocol!=="https:"&&url.hostname!=="localhost")
   throw new Error("A secure customer login URL is required.");
 if(url.username||url.password)throw new Error("Login URLs cannot contain embedded credentials.");
 url.hash="";
 // Always use the app's own public URL; never put an approved email in the URL.
 const publicLink=url.toString();
 return lang==="es"?
  `ACCESO VERIFICADO AL PORTAL DE CLIENTES DE WORKTEAMS

Su empresa de servicios ha autorizado el correo ${cleanEmail} para la ubicación ${cleanLocation}.

Para crear su cuenta de cliente o entrar, visite:
${publicLink}

Si ya tiene una cuenta, elija «Iniciar sesión». Use exactamente el correo aprobado y confirme su dirección de correo cuando se le solicite. Para poder entrar, el propietario debe activar primero el acceso de clientes.

No utilice el registro de empleados. No comparta su contraseña ni reenvíe información privada. Si recibió este mensaje por error, contacte directamente con su empresa de servicios.`:
  `WORKTEAMS VERIFIED CUSTOMER PORTAL

Your service provider approved ${cleanEmail} for the ${cleanLocation} service location.

To create your customer account or sign in, visit:
${publicLink}

If you already have an account, select Sign in. Use your exact approved email and confirm your email address when prompted. Your service provider's owner must activate customer login before access becomes available.

Do not use employee registration. Never share your password or forward private customer information. If this invitation was unexpected, contact your service provider directly.`;
}
