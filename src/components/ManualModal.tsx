import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  BookOpen,
  Receipt,
  Layers,
  ShieldCheck,
  LogIn,
  UserCog,
  Upload,
  CreditCard,
  Server,
  Lock,
  HelpCircle,
  ListChecks,
} from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '../version';

interface ManualModalProps {
  isOpen: boolean;
  role: 'admin' | 'user';
  onClose: () => void;
}

/** Small state badge that mirrors the color language used across the app. */
function Badge({ tone, children }: { tone: 'pend' | 'paid' | 'reten' | 'direct'; children: React.ReactNode }) {
  const map: Record<string, string> = {
    pend: 'bg-amber-50 text-amber-700 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    reten: 'bg-orange-50 text-orange-700 border-orange-200',
    direct: 'bg-slate-100 text-slate-600 border-slate-300',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${map[tone]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Callout({ warn = false, children }: { warn?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex gap-3 rounded-2xl p-4 border text-xs leading-relaxed ${
        warn
          ? 'bg-orange-50/70 border-orange-200 text-orange-950'
          : 'bg-indigo-50/70 border-indigo-100 text-indigo-950'
      }`}
    >
      <span className={`shrink-0 mt-0.5 ${warn ? 'text-orange-500' : 'text-indigo-500'}`}>
        {warn ? <ShieldCheck className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
      </span>
      <div className="[&_strong]:font-semibold">{children}</div>
    </div>
  );
}

interface Section {
  id: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  node: React.ReactNode;
}

export function ManualModal({ isOpen, role, onClose }: ManualModalProps) {
  const isAdmin = role === 'admin';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>('intro');

  const sections: Section[] = useMemo(
    () => [
      {
        id: 'intro',
        label: 'Qué es Factura ISF',
        icon: <Receipt className="w-4 h-4" />,
        node: (
          <>
            <p className="text-slate-600">
              <strong>Factura ISF</strong> digitaliza la rendición de gastos de Ingeniería Sin Fronteras Argentina. El
              equipo de terreno <strong>sube comprobantes</strong> (foto o archivo) y la <strong>Inteligencia
              Artificial los lee</strong> y completa los datos solos. El equipo administrativo los gestiona y{' '}
              <strong>paga reintegros, paga a proveedores</strong> o deja asentados pagos con <strong>tarjeta
              corporativa o de débito</strong>.
            </p>
            <p className="text-slate-600">
              Todos los datos viven en la nube de forma <strong>centralizada y compartida</strong> (se ven en tiempo
              real entre dispositivos) y los archivos se guardan automáticamente en <strong>Google Drive</strong>,
              ordenados por centro de costos. En el celular hay un botón flotante <span className="kbd">➕</span> para
              cargar un gasto rápido.
            </p>
          </>
        ),
      },
      {
        id: 'conceptos',
        label: 'Conceptos clave',
        icon: <Layers className="w-4 h-4" />,
        node: (
          <dl className="space-y-2">
            {[
              ['Comprobante / Gasto', 'Cada factura, ticket o recibo cargado. Es la unidad básica del sistema.'],
              ['Centro de Costos', 'El proyecto o rubro al que se imputa el gasto. Tiene una sigla (GPA, SEAP, GADM…) y una carpeta propia en Drive. Es obligatorio.'],
              ['Categoría', 'El tipo de gasto (Transporte, Alimentos y Viáticos, Honorarios…).'],
              ['Tipo de Pago', 'Cómo se pagó o se pagará el gasto. Hay 4, y definen si corresponde reintegro.'],
              ['Reintegro', 'Devolución de dinero a un colaborador que pagó de su bolsillo.'],
              ['Estado', 'Situación del comprobante: Pendiente, Pagado, Pagado - Pend. Retención o Directo.'],
              ['Datos de cuenta', 'CBU/CVU, Alias, Banco, CUIT y titular necesarios para transferir.'],
            ].map(([t, d]) => (
              <div key={t} className="flex flex-col sm:flex-row gap-1 sm:gap-3 border-b border-slate-100 pb-2">
                <dt className="font-semibold text-slate-800 sm:w-44 shrink-0">{t}</dt>
                <dd className="text-slate-600">{d}</dd>
              </div>
            ))}
          </dl>
        ),
      },
      {
        id: 'roles',
        label: 'Roles y accesos',
        icon: <UserCog className="w-4 h-4" />,
        node: (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="font-bold text-slate-900 text-sm mb-1">👤 Colaborador / Rendidor</h4>
                <p className="text-slate-600">Equipo de ingeniería y terreno. Solo ve la pestaña <strong>Mis Gastos</strong>. Carga comprobantes, ve/edita <strong>los suyos</strong> (si no están pagados) y edita su perfil bancario.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="font-bold text-slate-900 text-sm mb-1">🛡️ Administrador / Finanzas</h4>
                <p className="text-slate-600">Acceso total: además de lo anterior, ve <strong>Gestión Pagos, Proveedores, Centro de Costos, Usuarios/Roles, Sistema</strong> y <strong>Log de Cambios</strong>.</p>
              </div>
            </div>
            <Callout>
              El rol se determina por el correo con el que ingresás. Un administrador puede alternar entre vista Admin y
              vista Colaborador desde su perfil. Un colaborador <strong>no</strong> puede volverse Administrador: ese rol
              lo asigna un admin desde <em>Usuarios / Roles</em>.
            </Callout>
          </>
        ),
      },
      {
        id: 'login',
        label: 'Ingreso al sistema',
        icon: <LogIn className="w-4 h-4" />,
        node: (
          <>
            <ol className="list-decimal pl-5 space-y-1 text-slate-600">
              <li>Abrí la app: aparece «Factura ISF · Sistema de Comprobantes».</li>
              <li>Hacé clic en <strong>«Ingresar con cuenta de Google»</strong>.</li>
              <li>Elegí tu cuenta de Google institucional o habilitada.</li>
            </ol>
            <Callout warn>
              <strong>Solo entran los correos previamente habilitados</strong> por un administrador. Si tu correo no
              está habilitado verás «Acceso denegado… solicita a un administrador que te agregue». La app pide
              permisos mínimos de Google (identidad, nombre, email, foto): <strong>no</strong> accede a tu Drive ni Gmail
              personales.
            </Callout>
          </>
        ),
      },
      {
        id: 'perfil',
        label: 'Mi perfil y datos bancarios',
        icon: <UserCog className="w-4 h-4" />,
        node: (
          <>
            <p className="text-slate-600">
              Hacé clic en tu <strong>nombre/avatar</strong> (arriba a la derecha). Tu nombre y correo vienen de Google
              (solo lectura). El bloque <strong>«Mis Datos Bancarios para Reintegros»</strong> se carga una sola vez y
              queda autocompletado en tus rendiciones de tipo Reintegro:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>Banco / Billetera</strong> (ej. Galicia / Mercado Pago)</li>
              <li><strong>Tipo de Cuenta</strong> (Caja de Ahorro / Cuenta Corriente)</li>
              <li><strong>Alias</strong> · <strong>CUIT / CUIL</strong> · <strong>CBU / CVU</strong> (22 dígitos) · <strong>Titular</strong></li>
            </ul>
            <p className="text-slate-600">Guardá con <strong>«Guardar Datos de Destinatario»</strong>. Desde aquí también cerrás sesión o cambiás de cuenta.</p>
          </>
        ),
      },
      {
        id: 'colaborador',
        label: 'Cargar y ver comprobantes',
        icon: <Upload className="w-4 h-4" />,
        node: (
          <>
            <h4 className="font-bold text-slate-900 text-sm">Cargar comprobantes con IA</h4>
            <p className="text-slate-600">
              Tocá <strong>«Cargar Comprobante»</strong> (o el botón flotante <span className="kbd">➕</span>). Podés
              elegir por explorador (se abre solo), por <strong>«Seleccionar archivos»</strong> o
              <strong> arrastrando</strong>. Acepta <strong>JPG, PNG y PDF</strong>, y varios a la vez. La IA (Google
              Gemini) completa proveedor, monto, moneda, fecha, CUIT, N° de factura e ítems, y verifica si está a nombre
              de ISF (CUIT 30‑71254928‑5).
            </p>
            <p className="text-slate-600">
              <strong>Vos revisás y completás:</strong> Monto y Fecha (obligatorios), <strong>Centro de Costos</strong>
              {' '}(obligatorio), <strong>Tipo de pago</strong> y, si corresponde, los datos de cuenta. Guardás por fila
              o con «Guardar todos los listos». Al guardar, se sube solo a Drive y te llega un correo de confirmación.
            </p>

            <h4 className="font-bold text-slate-900 text-sm mt-4">Los 4 tipos de pago</h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr className="text-left">
                    <th className="p-2.5 font-semibold">Tipo</th>
                    <th className="p-2.5 font-semibold">Cuándo</th>
                    <th className="p-2.5 font-semibold">¿Datos banc.?</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600">
                  <tr className="border-t border-slate-100"><td className="p-2.5 font-semibold">🔄 Reintegro</td><td className="p-2.5">Pagaste de tu bolsillo y pedís devolución.</td><td className="p-2.5">Sí (tu perfil)</td></tr>
                  <tr className="border-t border-slate-100"><td className="p-2.5 font-semibold">🏢 Pago a Proveedor</td><td className="p-2.5">Se transfiere directo al proveedor.</td><td className="p-2.5">Sí (catálogo)</td></tr>
                  <tr className="border-t border-slate-100"><td className="p-2.5 font-semibold">💳 Tarjeta Corporativa</td><td className="p-2.5">Se abonó con la tarjeta corporativa.</td><td className="p-2.5">No</td></tr>
                  <tr className="border-t border-slate-100"><td className="p-2.5 font-semibold">🏦 Tarjeta Débito Galicia</td><td className="p-2.5">Débito de la cuenta institucional Galicia.</td><td className="p-2.5">No</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-slate-600 text-xs">La IA no decide el tipo de pago: lo elegís vos. Si no elegís ninguno, se asume Tarjeta Corporativa.</p>

            <h4 className="font-bold text-slate-900 text-sm mt-4">Mis Gastos: ver, buscar, editar</h4>
            <p className="text-slate-600">Muestra <strong>solo tus comprobantes</strong>, con tu total arriba. Buscás por cualquier campo y ordenás por columna. Por fila: 👁 Ver · ✏️ Editar (si ya está pagado aparece un candado 🔒 y queda bloqueado) · 🗑 Eliminar. Estados:</p>
            <div className="flex flex-wrap gap-2">
              <Badge tone="pend">Pendiente</Badge>
              <Badge tone="paid">Pagado</Badge>
              <Badge tone="reten">Pagado - Pend. Retención</Badge>
              <Badge tone="direct">Directo</Badge>
            </div>
            <p className="text-slate-600 mt-3">El visor de comprobante permite <strong>Descargar</strong>, <strong>Ver en Drive</strong> y <strong>Reemplazar</strong> el archivo (ej. una foto borrosa) sin alterar los datos contables.</p>
          </>
        ),
      },
      {
        id: 'admin',
        label: 'Gestión de Pagos',
        icon: <CreditCard className="w-4 h-4" />,
        adminOnly: true,
        node: (
          <>
            <p className="text-slate-600">La pestaña <strong>«Gestión Pagos»</strong> es el panel del equipo contable. Buscás por proveedor, solicitante, alias o CBU; filtrás por estado y por centro de costos. Los botones de estado dicen qué hacer:</p>
            <div className="flex flex-col gap-1.5 text-xs text-slate-600">
              <div><Badge tone="paid">Pagar</Badge> — comprobante pendiente, abre el pago.</div>
              <div><Badge tone="paid">Pagado</Badge> — liquidado (al pasar el mouse: <em>Revertir</em>).</div>
              <div><Badge tone="reten">Pend. Retención</Badge> — falta el certificado.</div>
              <div><Badge tone="direct">Directo</Badge> — pago institucional, sin acción.</div>
            </div>

            <h4 className="font-bold text-slate-900 text-sm mt-4">Pagar (individual)</h4>
            <ol className="list-decimal pl-5 space-y-1 text-slate-600">
              <li>«Pagar» abre el resumen con los datos bancarios del destinatario.</li>
              <li>Adjuntá el <strong>comprobante de transferencia</strong> (opcional): PNG, JPG, PDF o <span className="kbd">Ctrl+V</span>.</li>
              <li>Tildá <strong>«Aplica Retenciones»</strong> si corresponde (queda en <Badge tone="reten">Pend. Retención</Badge>).</li>
              <li><strong>«Confirmar Pago»</strong>: sube la constancia a Drive, envía el correo al solicitante (con CC automático) y marca <Badge tone="paid">Pagado</Badge>.</li>
            </ol>

            <h4 className="font-bold text-slate-900 text-sm mt-4">Pago en lote</h4>
            <p className="text-slate-600">Con varias filas seleccionadas, «Pagar» agrupa los comprobantes <strong>por solicitante</strong> (cada uno recibe su correo con desglose). <strong>«Confirmar y Pagar (N)»</strong> marca todos como Pagados.</p>
            <Callout warn>
              <strong>Diferencia:</strong> el pago individual archiva la constancia en Drive; el pago en lote la adjunta a los correos y la guarda en el registro, pero <strong>no la sube a la carpeta de Drive</strong>.
            </Callout>

            <h4 className="font-bold text-slate-900 text-sm mt-4">Retenciones, reversión y más</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>Certificado de retenciones:</strong> al hacer clic en <Badge tone="reten">Pend. Retención</Badge> adjuntás el certificado AFIP/ARCA; se archiva, se envía por correo y pasa a <Badge tone="paid">Pagado</Badge> definitivo.</li>
              <li><strong>Revertir un pago:</strong> vuelve a <Badge tone="pend">Pendiente</Badge>, envía aviso al solicitante y elimina de Drive la constancia y el certificado.</li>
              <li><strong>Pedir datos bancarios:</strong> «Pedir Datos» envía un correo prearmado solicitando CBU/Alias.</li>
              <li><strong>Exportar CSV</strong> de lo seleccionado o filtrado.</li>
              <li><strong>Proveedores:</strong> catálogo oficial con cuentas; alta manual, con IA (Constancia de CUIT) o importación CSV. Alias/CBU duplicados prohibidos.</li>
              <li><strong>Centros de Costos:</strong> siglas + carpeta de Drive + emails en copia.</li>
              <li><strong>Usuarios / Roles:</strong> habilitar personas, asignar rol y CC global; alta con correo de bienvenida.</li>
              <li><strong>Sistema y Log de Cambios:</strong> métricas de uso/costos y auditoría en tiempo real, campo a campo.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'arquitectura',
        label: 'Cómo funciona por detrás',
        icon: <Server className="w-4 h-4" />,
        adminOnly: true,
        node: (
          <>
            <p className="text-slate-600 text-xs">Orientativo para administradores técnicos. Frontend React + TypeScript, backend Express que centraliza los servicios de Google; datos en Firebase Firestore.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ['🤖 IA — Google Gemini', 'Lee facturas (OCR), constancias, audio y texto. Modelo gemini-3.7-flash con respaldo. ~US$0,10/millón de tokens de entrada y ~US$0,40/salida.'],
                ['📁 Archivo — Google Drive', 'Cada centro de costos tiene su carpeta. Todo se sube en nombre de la cuenta institucional maestra: nadie necesita acceso propio a Drive.'],
                ['✉️ Correos — Gmail API', 'Plantillas HTML institucionales. El CC automático combina usuarios «copiar en todo», emails del centro de costos y CC explícito.'],
                ['☁️ Datos — Firestore', 'Centralizado y en tiempo real. Los archivos binarios nunca se guardan en Firestore, solo en Drive; en la base van los datos livianos y los enlaces.'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                  <h4 className="font-bold text-slate-900 text-xs mb-1">{t}</h4>
                  <p className="text-slate-600 text-xs">{d}</p>
                </div>
              ))}
            </div>
            <p className="text-slate-600 text-xs mt-3">Nomenclatura en Drive:</p>
            <code className="block overflow-x-auto bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-mono text-indigo-700 whitespace-nowrap">
              SIGLA-Nombre Solicitante-AAAAMMDD-Monto.ext → GPA-Juan Perez-20260514-15400.pdf
            </code>
            <p className="text-slate-500 text-[11px] mt-2">Los comprobantes de pago llevan <code>-ComprobantePago-</code> y los certificados <code>-CertificadoRetencion-</code>. Colecciones: expenses, vendors, cost_centers, categories, app_users, user_preferences, audit_logs, api_usage_logs, system_health.</p>
          </>
        ),
      },
      {
        id: 'seguridad',
        label: 'Seguridad y privacidad',
        icon: <Lock className="w-4 h-4" />,
        node: (
          <>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>Acceso restringido:</strong> solo entran los correos habilitados.</li>
              <li><strong>Datos bancarios:</strong> se usan solo para reintegros y transferencias. No se venden ni ceden a terceros.</li>
              <li><strong>Permisos de Google mínimos</strong> para los usuarios; las operaciones sobre Drive/Gmail las hace el servidor con la cuenta institucional.</li>
              <li><strong>Trazabilidad:</strong> cada cambio queda en el Log de Cambios.</li>
            </ul>
            <p className="text-slate-500 text-[11px]">Contacto institucional: <a href="mailto:admin@isf-argentina.org" className="text-indigo-600 font-semibold hover:underline">admin@isf-argentina.org</a></p>
          </>
        ),
      },
      {
        id: 'faq',
        label: 'Preguntas frecuentes',
        icon: <HelpCircle className="w-4 h-4" />,
        node: (
          <div className="space-y-2.5">
            {[
              ['No puedo iniciar sesión / «Acceso denegado»', 'Tu correo no está habilitado. Pedile a un administrador que te agregue en Usuarios / Roles.', false],
              ['No puedo editar (aparece un candado)', 'El comprobante ya fue pagado y queda bloqueado. Administración puede revertir el pago y luego editarlo.', false],
              ['La IA no detectó monto o fecha', 'La fila queda marcada «Falta Monto o Fecha». Completalos a mano y guardá, o usá «Reintentar».', false],
              ['Aviso «no es CUIT ISF»', 'El comprobante no figura a nombre de ISF. Verificá el destinatario; podés continuar con «Aceptar» si corresponde.', false],
              ['El comprobante dice «Fallo Drive»', 'La subida a Drive falló. Usá «Reintentar» en la fila; el dato contable ya quedó guardado.', false],
              ['Necesito reintegrar y no tengo el CBU', 'Usá «Pedir Datos» en Gestión de Pagos para pedirlo por correo.', true],
              ['¿Pagar muchos comprobantes juntos?', 'Seleccioná varias filas en Gestión de Pagos y usá «Pagar» (pago en lote).', true],
            ]
              .filter(([, , adminOnly]) => isAdmin || !adminOnly)
              .map(([q, a]) => (
                <div key={q as string} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="font-semibold text-slate-800 text-xs mb-0.5">{q}</p>
                  <p className="text-slate-600 text-xs">{a}</p>
                </div>
              ))}
          </div>
        ),
      },
      {
        id: 'anexos',
        label: 'Anexos',
        icon: <ListChecks className="w-4 h-4" />,
        node: (
          <>
            <h4 className="font-bold text-slate-900 text-sm">Estados de un comprobante</h4>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex gap-2 items-baseline"><Badge tone="pend">Pendiente</Badge><span>Falta liquidar el reintegro o el pago.</span></div>
              <div className="flex gap-2 items-baseline"><Badge tone="paid">Pagado</Badge><span>Reintegro o pago confirmado.</span></div>
              <div className="flex gap-2 items-baseline"><Badge tone="reten">Pend. Retención</Badge><span>Pagado; falta el certificado de retención.</span></div>
              <div className="flex gap-2 items-baseline"><Badge tone="direct">Directo</Badge><span>Pago institucional; no requiere reintegro.</span></div>
            </div>
            <h4 className="font-bold text-slate-900 text-sm mt-4">Categorías de gasto</h4>
            <p className="text-slate-500 text-[11px] leading-relaxed">Materiales de Construcción e Instalación · Herramientas y Equipamiento · Transporte, Combustible y Peajes · Alojamiento y Hospedaje · Alimentos y Viáticos · Honorarios y Servicios Profesionales · Librería, Impresiones y Papelería · Comunicaciones, Envíos y Telefonía · Eventos, Talleres y Capacitación · Servicios Básicos y Mantenimiento · Insumos y Papelería de Oficina · Otros Gastos Operativos.</p>
            <p className="text-slate-500 text-[11px] mt-2">El catálogo de centros de costos y categorías se administra desde las pestañas correspondientes.</p>
          </>
        ),
      },
    ],
    [isAdmin]
  );

  const visibleSections = useMemo(() => sections.filter((s) => isAdmin || !s.adminOnly), [sections, isAdmin]);

  // Scrollspy within the modal content container
  useEffect(() => {
    if (!isOpen) return;
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      const top = container.scrollTop;
      let current = visibleSections[0]?.id || 'intro';
      for (const s of visibleSections) {
        const el = document.getElementById(`manual-sec-${s.id}`);
        if (el && el.offsetTop - 120 <= top) current = s.id;
      }
      setActive(current);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, [isOpen, visibleSections]);

  // Reset to top whenever it opens
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setActive(visibleSections[0]?.id || 'intro');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const goTo = (id: string) => {
    const el = document.getElementById(`manual-sec-${id}`);
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
      setActive(id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Manual de Uso</h2>
              <p className="text-xs text-slate-400">
                Guía de {isAdmin ? 'Administración y Finanzas' : 'Colaborador / Rendidor'} — Factura ISF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            aria-label="Cerrar manual"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: TOC + content */}
        <div className="flex flex-1 min-h-0">
          {/* TOC */}
          <nav className="hidden md:block w-60 shrink-0 border-r border-slate-200 bg-slate-50/60 overflow-y-auto py-3">
            <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Contenido</p>
            <ul className="px-2 space-y-0.5">
              {visibleSections.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => goTo(s.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[13px] font-medium transition cursor-pointer ${
                      active === s.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span className={active === s.id ? 'text-white' : 'text-slate-400'}>{s.icon}</span>
                    <span className="leading-tight">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 space-y-10 text-xs leading-relaxed">
            {/* Mobile chip nav */}
            <div className="md:hidden -mx-5 px-5 pb-1 overflow-x-auto flex gap-2 whitespace-nowrap">
              {visibleSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => goTo(s.id)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
                    active === s.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {visibleSections.map((s, i) => (
              <section key={s.id} id={`manual-sec-${s.id}`} className="scroll-mt-4 space-y-3">
                <div className="flex items-baseline gap-2.5 border-b border-slate-100 pb-2">
                  <span className="font-mono text-[11px] font-bold text-indigo-500">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900">{s.label}</h3>
                </div>
                <div className="space-y-3 [&_.kbd]:inline-block [&_.kbd]:bg-slate-100 [&_.kbd]:border [&_.kbd]:border-slate-200 [&_.kbd]:rounded-md [&_.kbd]:px-1.5 [&_.kbd]:text-[11px] [&_.kbd]:font-mono [&_.kbd]:text-indigo-700 [&_code]:bg-slate-100 [&_code]:rounded [&_code]:px-1 [&_code]:text-[11px] [&_code]:text-indigo-700">
                  {s.node}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-500">© 2026 Ingeniería Sin Fronteras Argentina</span>
            <span className="text-slate-300">•</span>
            <span className="text-[11px] font-mono text-slate-400" title={`Compilación: ${APP_BUILD_DATE}`}>v{APP_VERSION}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
