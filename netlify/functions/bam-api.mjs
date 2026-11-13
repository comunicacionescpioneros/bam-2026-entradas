// Proxy de servidor Netlify -> Apps Script. El secreto jamás se entrega al navegador.
const ALLOWED = new Set([
  'crearCompra', 'actualizarCompra', 'obtenerCompra', 'registrarOrden',
  'adminLogin', 'adminLogout', 'adminListar', 'adminActualizarEstado', 'adminExportarCSV'
]);
const json = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
export default async function handler(request) {
  if (request.method !== 'POST') return json({ok:false,error:'Método no permitido.'},405);
  const url = process.env.GAS_WEBAPP_URL;
  const secret = process.env.GAS_BRIDGE_SECRET;
  if (!url || !secret || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
    return json({ok:false,error:'Falta configurar la conexión del servidor con Apps Script.'},503);
  }
  let payload;
  try {
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 12000) return json({ok:false,error:'Solicitud demasiado grande.'},413);
    const raw = await request.text();
    if (raw.length > 12000) return json({ok:false,error:'Solicitud demasiado grande.'},413);
    payload=JSON.parse(raw);
  } catch {return json({ok:false,error:'Solicitud inválida.'},400);}
  if (!ALLOWED.has(payload?.fn) || !Array.isArray(payload?.args) || payload.args.length>5) {
    return json({ok:false,error:'Operación no permitida.'},400);
  }
  try {
    const upstream=await fetch(url, {
      method:'POST', redirect:'follow',
      headers:{'Content-Type':'text/plain; charset=utf-8'},
      body:JSON.stringify({key:secret,fn:payload.fn,args:payload.args}),
      signal:AbortSignal.timeout(25000)
    });
    if(!upstream.ok) return json({ok:false,error:'No se pudo contactar con Google Apps Script.'},502);
    const text=await upstream.text();
    let result;
    try {result=JSON.parse(text);} catch {return json({ok:false,error:'La respuesta de Google Apps Script no es válida. Revisa permisos y URL de implementación.'},502);}
    if(typeof result.ok !== 'boolean') return json({ok:false,error:'Respuesta no reconocida del backend.'},502);
    return json(result, result.ok ? 200 : 400);
  } catch(err) {
    return json({ok:false,error:'El servidor no respondió. Revisa el estado de la operación antes de reintentar.'},504);
  }
}
