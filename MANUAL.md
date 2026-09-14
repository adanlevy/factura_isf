# Manual de Funcionamiento — Factura ISF

**Sistema de Rendición de Comprobantes y Gestión de Pagos**
Ingeniería Sin Fronteras Argentina (CUIT 30‑71254928‑5)

> Versión de la aplicación al momento de este manual: **v2.5.9** (compilación 2026.09.11).
> Este documento describe el funcionamiento de la aplicación tal como está implementada en el código de este repositorio.

---

## Índice

1. [¿Qué es Factura ISF?](#1-qué-es-factura-isf)
2. [Conceptos clave (glosario rápido)](#2-conceptos-clave-glosario-rápido)
3. [Roles y perfiles de acceso](#3-roles-y-perfiles-de-acceso)
4. [Ingreso al sistema (login)](#4-ingreso-al-sistema-login)
5. [Mi perfil y datos bancarios](#5-mi-perfil-y-datos-bancarios)
6. [Guía para el Colaborador / Rendidor](#6-guía-para-el-colaborador--rendidor)
   - 6.1 [Cargar comprobantes con IA](#61-cargar-comprobantes-con-ia)
   - 6.2 [Los 4 tipos de pago](#62-los-4-tipos-de-pago)
   - 6.3 [Centro de costos y categoría](#63-centro-de-costos-y-categoría)
   - 6.4 [Mis Gastos: ver, buscar, editar](#64-mis-gastos-ver-buscar-editar-y-eliminar)
   - 6.5 [Ver y reemplazar un comprobante](#65-ver-y-reemplazar-un-comprobante)
   - 6.6 [Correos automáticos que vas a recibir](#66-correos-automáticos-que-vas-a-recibir)
7. [Guía para Administración y Finanzas](#7-guía-para-administración-y-finanzas)
   - 7.1 [Gestión de Pagos](#71-gestión-de-pagos)
   - 7.2 [Pedir datos bancarios](#72-pedir-datos-bancarios)
   - 7.3 [Pagar un reintegro o proveedor (individual)](#73-pagar-un-reintegro-o-proveedor-individual)
   - 7.4 [Pago en lote](#74-pago-en-lote)
   - 7.5 [Retenciones: certificado](#75-retenciones-certificado-de-retenciones)
   - 7.6 [Revertir un pago](#76-revertir-un-pago)
   - 7.7 [Exportar y respaldos](#77-exportar-csv)
   - 7.8 [Proveedores](#78-proveedores)
   - 7.9 [Centros de Costos](#79-centros-de-costos)
   - 7.10 [Usuarios y Roles](#710-usuarios--roles)
   - 7.11 [Sistema y Métricas](#711-sistema-y-métricas)
   - 7.12 [Log de Cambios y Auditoría](#712-log-de-cambios-y-auditoría)
8. [Cómo funciona por detrás (arquitectura)](#8-cómo-funciona-por-detrás-arquitectura)
9. [Seguridad y privacidad](#9-seguridad-y-privacidad)
10. [Preguntas frecuentes y resolución de problemas](#10-preguntas-frecuentes-y-resolución-de-problemas)
11. [Anexos](#11-anexos)

---

## 1. ¿Qué es Factura ISF?

**Factura ISF** es una aplicación web para digitalizar la rendición de gastos de Ingeniería Sin Fronteras Argentina. Resuelve dos necesidades:

- **Para el equipo de terreno / colaboradores:** subir comprobantes (facturas, tickets, recibos) sacándoles una foto o adjuntando el archivo. La aplicación **lee el comprobante con Inteligencia Artificial** y completa los datos automáticamente (proveedor, monto, fecha, CUIT, N° de factura).
- **Para el equipo administrativo / de finanzas:** administrar todos esos comprobantes y **pagar reintegros, pagar a proveedores, o dejar asentados pagos con tarjeta corporativa o de débito**, con avisos por correo, archivo automático en Google Drive y trazabilidad completa.

Todos los datos se guardan en **la nube (Firebase Firestore) de forma centralizada y compartida**: lo que carga una persona lo ven todas en tiempo real, en cualquier dispositivo. Las imágenes y archivos se archivan automáticamente en **Google Drive**, ordenados por centro de costos.

La aplicación funciona en el navegador (computadora o celular). En el celular aparece un botón flotante **➕** para cargar un gasto rápido.

---

## 2. Conceptos clave (glosario rápido)

| Concepto | Qué significa |
|---|---|
| **Comprobante / Gasto** | Cada factura, ticket o recibo cargado. Es la unidad básica del sistema. |
| **Centro de Costos** | El proyecto o rubro al que se imputa el gasto (ej. *Gastos Proyectos de Agua*, *SEAP*, *Gastos de Administración*). Cada uno tiene una **sigla** (ej. `GPA`, `SEAP`, `GADM`) y una **carpeta propia en Google Drive**. Es **obligatorio** asignarlo. |
| **Categoría** | El tipo de gasto (ej. *Transporte*, *Alimentos y Viáticos*, *Honorarios*). |
| **Tipo de Pago** | Cómo se pagó o se va a pagar el gasto. Hay 4 (ver §6.2). Define si corresponde reintegro. |
| **Reintegro** | Devolución de dinero a un colaborador que pagó de su bolsillo. |
| **Estado** | Situación del comprobante: *Pendiente*, *Pagado*, *Pagado - Pend. Retención* o *Directo*. |
| **Proveedor** | Empresa o persona a la que se le paga. Existe un **catálogo de proveedores** con sus datos bancarios. |
| **Datos de cuenta** | CBU/CVU, Alias, Banco, CUIT y titular necesarios para transferir. |
| **Retenciones** | Retenciones impositivas (AFIP/ARCA) que a veces deben practicarse al pagar; requieren un **certificado**. |

---

## 3. Roles y perfiles de acceso

Existen **dos perfiles**. El perfil se determina automáticamente según el correo con el que ingresás.

### 👤 Colaborador / Rendidor (`user`)
Es el equipo de ingeniería y terreno. Puede:
- Cargar comprobantes.
- Ver, buscar y editar **sus propios** comprobantes en *Mis Gastos* (mientras no estén pagados).
- Ver y editar su perfil y datos bancarios.

Solo ve la pestaña **Mis Gastos**.

### 🛡️ Administrador / Finanzas (`admin`)
Es el equipo administrativo, financiero y de tesorería. Tiene **acceso total**: todo lo del colaborador **más** las pestañas:
- **Gestión Pagos** — liquidar reintegros y pagos.
- **Proveedores** — catálogo de proveedores y cuentas.
- **Centro de Costos** — gestión de siglas y carpetas de Drive.
- **Usuarios / Roles** — habilitar personas y asignar roles.
- **Sistema** — métricas de uso y costos.
- **Log de Cambios** — auditoría de todo lo que se modifica.

### Cambio de vista
Un usuario administrador puede alternar entre "vista Administrador" y "vista Colaborador" desde su **perfil** (botones **Admin** / **Colaborador**), útil para ver la aplicación como la ve un rendidor. Un colaborador **no** puede pasarse a Administrador: el rol lo asigna un administrador desde *Usuarios / Roles*.

---

## 4. Ingreso al sistema (login)

1. Abrí la aplicación. Aparece la pantalla **"Factura ISF — Ingeniería Sin Fronteras Argentina · Sistema de Comprobantes"**.
2. Hacé clic en **"Ingresar con cuenta de Google"**.
3. Elegí tu cuenta de Google institucional o habilitada.

**Importante sobre quién puede entrar:**
- Solo pueden ingresar los correos **previamente habilitados** por un administrador (desde *Usuarios / Roles*), más un conjunto de administradores predefinidos de la organización.
- Si tu correo no está habilitado, verás: *"Acceso denegado: El correo … no está habilitado como colaborador o administrador. Por favor, solicita a un administrador que te agregue en el panel de gestión de usuarios."*
- La aplicación **solo pide permisos mínimos de Google** (tu identidad, nombre, email y foto). **No** pide acceso a tu Drive ni a tu Gmail personales.

> **Nota técnica (error 400 / origin_mismatch):** si aparece un error de origen al iniciar sesión, la pantalla ofrece una sección **"Verificar Client ID y Origen OAuth"** para copiar el origen que debe registrarse en Google Cloud Console. Es una tarea de configuración para el administrador técnico, no un paso normal del usuario.

---

## 5. Mi perfil y datos bancarios

Hacé clic en tu **nombre/avatar** (arriba a la derecha) para abrir tu perfil.

- **Identidad de Google (solo lectura):** *Nombre y Apellido* y *Correo Electrónico* vienen de Google y no se editan manualmente.
- **Mis Datos Bancarios para Reintegros:** cargá una sola vez tus datos y quedan **autocompletados en tus rendiciones de tipo Reintegro**. Campos:
  - **Banco / Billetera** (ej. Galicia / Mercado Pago)
  - **Tipo de Cuenta** (Caja de Ahorro / Cuenta Corriente)
  - **Alias**
  - **CUIT / CUIL**
  - **CBU / CVU (22 dígitos)**
  - **Titular de la Cuenta**
- Guardá con **"Guardar Datos de Destinatario"**.

Desde este panel también podés **cerrar sesión / cambiar de cuenta** ("Desconectar cuenta").

---

## 6. Guía para el Colaborador / Rendidor

### 6.1 Cargar comprobantes con IA

Para cargar un gasto, tocá **"Cargar Comprobante"** (o el botón flotante **➕** en el celular). Se abre la ventana **"Carga de Comprobantes — Extracción con IA"**.

**Formas de cargar:**
- Al abrirse, **se abre solo el explorador de archivos** para que elijas rápido.
- Botón **"Cargar"** o **"Seleccionar archivos"**: acepta **imágenes (JPG, PNG) y PDF**, y **podés seleccionar varios a la vez**.
- **Arrastrar y soltar** los archivos sobre la ventana.

> En el celular, al elegir archivo el sistema operativo suele ofrecer la cámara como una opción más del diálogo. La aplicación no tiene un botón de cámara ni de grabación de voz propios.

**Qué hace la IA automáticamente:** cada archivo aparece como una fila con una miniatura y el cartel **"Analizando IA…"**. La Inteligencia Artificial (Google Gemini) **lee el comprobante** y completa:
- **Proveedor / comercio**
- **Monto** y **moneda** (por defecto ARS)
- **Fecha**
- **CUIT** del emisor
- **N° de factura / ticket**
- **Ítems** (detalle de renglones, si figuran)
- Verifica si el comprobante está **emitido a nombre de ISF** (CUIT 30‑71254928‑5).

**Si el comprobante no está a nombre de ISF**, aparece un aviso: *"Atención: Titular del Comprobante — La factura no parece estar a nombre de Ingeniería Sin Fronteras"*, mostrando a quién figura, y podés **Cancelar carga** o **Aceptar** y continuar igual.

**Qué tenés que completar o revisar vos:**
- Verificar/corregir **Monto** y **Fecha** (son obligatorios; si la IA no los detecta con certeza, la fila queda marcada como *"Falta Monto o Fecha"* y hay que completarlos a mano).
- Elegir el **Centro de Costos** (obligatorio).
- Elegir el **Tipo de pago** (ver §6.2).
- Completar **datos de cuenta** si corresponde (reintegro o pago a proveedor).
- Notas contables si querés.

**Guardar:** botón verde de guardar en cada fila, o **"Guardar todos los listos (N)"** cuando hay varios listos. Al guardar, el comprobante:
- Se registra en la nube y **se sube automáticamente a Google Drive**, a la carpeta del centro de costos.
- Se dispara un **correo de confirmación** al que lo cargó, con el resumen.

### 6.2 Los 4 tipos de pago

El tipo de pago define **cómo se pagó** y **si corresponde reintegro**. Es de selección **mutuamente excluyente** (uno solo):

| Tipo | Cuándo usarlo | ¿Requiere datos bancarios? | Estado inicial |
|---|---|---|---|
| **🔄 Reintegro** | El colaborador pagó con **fondos propios** y pide que se lo devuelvan. | **Sí** — tus datos de cuenta (se autocompletan desde tu perfil). | Pendiente de reintegro |
| **🏢 Pago a Proveedor** | Se le va a **transferir directamente al proveedor**. | **Sí** — datos de la cuenta del proveedor (se eligen del catálogo). | Pendiente de pago |
| **💳 Tarjeta Corporativa** | Se **abonó con la tarjeta corporativa** de la organización. | No | Directo (no requiere reintegro) |
| **🏦 Tarjeta Débito Galicia** | Se **debitó de la cuenta institucional del Banco Galicia**. | No | Directo (no requiere reintegro) |

- En **Reintegro**, si no tenés datos de cuenta cargados, la aplicación los toma de tu perfil, o podés usar el botón **"Ingresar mi cuenta"**.
- En **Pago a Proveedor**, elegís el proveedor del **catálogo oficial** y sus datos (CBU, alias, CUIT, titular) se completan solos y quedan en modo lectura.
- La IA **no** decide el tipo de pago: lo elegís vos. Si no elegís ninguno, el sistema asume **Tarjeta Corporativa**.

### 6.3 Centro de costos y categoría

- **Centro de Costos (obligatorio):** la aplicación **sugiere** uno automáticamente según tu historial de uso, y el desplegable está agrupado en **"⭐ Frecuentes"** y **"📁 Todos los Centros (A‑Z)"**. Podés cambiarlo. Cada centro de costos tiene una sigla y una carpeta de Drive asociadas.
- **Categoría:** en la carga masiva de comprobantes la categoría se guarda como *General*. La **categoría específica** (ej. *Transporte, Combustible y Peajes*) se puede asignar/ajustar desde la **edición del comprobante** (§6.4), donde también está disponible para el equipo administrativo.

### 6.4 Mis Gastos: ver, buscar, editar y eliminar

La pestaña **"Mis Gastos"** muestra **solo tus comprobantes** (los que cargaste vos). Arriba ves tu total: *"Comprobantes de {vos}: {cantidad} • Monto acumulado: {total}"*.

- **Buscar:** caja de búsqueda por proveedor, centro de costos, CUIT, notas, N° de factura, monto, alias/CBU, etc.
- **Ordenar:** hacé clic en el encabezado de cualquier columna (Fecha Carga, Fecha Doc., Nombre/Factura, Centro de Costos, Monto, Estado…).
- **Columnas:** Fecha de carga, Fecha del documento, Nombre/Factura, Centro de Costos (con acceso a la carpeta de Drive y estado de subida), Monto, **Estado**, Datos de Cuenta, Notas Contables y Acciones.
- **Estados posibles:** **Pendiente** (ámbar), **Pagado** (verde), **Pagado - Pend. Retención** (naranja) o **Directo** (gris, pagos institucionales que no requieren reintegro).
- **Acciones por fila:**
  - 👁 **Ver comprobante** — abre el visor.
  - ✏️ **Editar** — abre la edición. **Si el comprobante ya está pagado, aparece un candado 🔒 y no se puede editar** (queda bloqueado).
  - 🗑 **Eliminar** — pide confirmación (lo borra tanto de *Mis Gastos* como de *Gestión de Pagos*).

### 6.5 Ver y reemplazar un comprobante

El **visor de comprobante** muestra la imagen o PDF y todos los datos: Monto, Centro de Costos, Solicitante, Categoría, Forma de Pago, Estado, datos de transferencia (con botón **Copiar**), notas, nota de voz procesada (si la hubiera) e ítems de la factura.

Tiene **pestañas** según lo que exista: *Factura / Ticket Original*, *Comprobante de Pago* y *Certificado de Retención*.

Desde el visor podés **Descargar**, **Ver en Drive** y **Reemplazar** la foto/archivo. **Reemplazar** cambia el archivo (por ejemplo, una foto borrosa por una nítida) **sin alterar los datos contables**, y actualiza también la copia en Google Drive.

### 6.6 Correos automáticos que vas a recibir

El sistema te envía correos automáticamente (a la cuenta con la que cargaste el comprobante):
- **Confirmación de carga** de tu comprobante o de un lote (resumen con tabla y total).
- **Solicitud de datos bancarios**, si Administración necesita tu CBU/Alias para reintegrarte.
- **Confirmación de pago / reintegro liquidado**, cuando te pagan.
- **Reversión**, si un pago se revirtió a pendiente.
- **Bienvenida**, cuando un administrador te da de alta por primera vez.

---

## 7. Guía para Administración y Finanzas

*(Requiere perfil Administrador / Finanzas.)*

### 7.1 Gestión de Pagos

La pestaña **"Gestión Pagos"** es el panel central del equipo contable. Es una tabla (o tarjetas en el celular) con todos los comprobantes.

- **Buscar:** *"Buscar por proveedor, solicitante, alias, CBU…"* (busca en prácticamente todos los campos, incluidos los bancarios).
- **Filtrar por estado:** Todos, **Pendientes de Reintegro / Pago**, **Pagado - Pendiente Retención**, **Pendientes Sin Datos Bancarios**, **Ya Reintegrados / Pagados**, **Pago Institucional Directo**.
- **Filtrar por centro de costos** (con un grupo de "Más Utilizados").
- **Columnas:** Fecha Carga, Fecha Doc., Enviado por, Nombre/Factura, Centro de Costos (con enlace a la carpeta de Drive y estado de subida), Monto, **Estado**, Datos de Cuenta, Notas Contables y Acciones.

**Los botones de estado dicen qué hacer:**
- **"Pagar"** (verde) — comprobante pendiente: abre el proceso de pago.
- **"Pagado"** (verde) — ya liquidado; al pasar el mouse ofrece **"Revertir"**.
- **"Pagado - Pend. Retención"** (naranja) — pagado pero falta subir el certificado de retención; al hacer clic se abre la carga del certificado.
- **"Directo"** (gris) — pago institucional que no requiere acción.

**Selección múltiple:** al tildar varias filas aparece una barra con el **total seleccionado** y botones **"Pagar"** (pago en lote), **"Eliminar"** y **"Limpiar"**. Siempre está disponible **"Exportar CSV"**.

### 7.2 Pedir datos bancarios

Cuando un reintegro está pendiente y **no tiene CBU/Alias**, en la columna *Datos de Cuenta* aparece **"Pedir Datos"** (o **"Re‑pedir"** si ya se pidió). Abre un correo prearmado que solicita al colaborador su **CBU/CVU, Alias, Banco y CUIT/CUIL**. Podés:
- Editar destinatario, asunto y mensaje.
- **"Abrir en Gmail (1 Clic)"**, usar **"Otro Correo"** (mailto) o **"Copiar"** el texto.
- **"Registrar & Despachar"** para enviarlo por la API de Gmail y dejar registrada la fecha del pedido.

### 7.3 Pagar un reintegro o proveedor (individual)

Con **"Pagar"** se abre **"Pagar Comprobante y Liquidar Reintegro"**:

1. **Resumen** del comprobante (proveedor, monto, centro de costos, solicitante).
2. **Datos bancarios** del destinatario (o aviso de que no hay, para pagos en efectivo/otro canal).
3. **Cargar comprobante de pago / transferencia (opcional):** adjuntá la constancia (PNG, JPG, PDF **o pegá una captura con Ctrl+V**). Se puede previsualizar, reemplazar o quitar.
4. **"Aplica Retenciones"** (opcional): si lo tildás, el comprobante quedará como **"Pagado - Pend. Retención"** (naranja) hasta que subas el certificado.
5. **"Confirmar Pago"**. Al confirmar, el sistema:
   - Sube el comprobante de transferencia a la carpeta de Drive del centro de costos.
   - **Envía un correo de confirmación** al solicitante (con copia automática — ver §8.3), con los datos de la transferencia y la constancia adjunta.
   - Marca el comprobante como **Pagado / Reintegrado** con su fecha.

### 7.4 Pago en lote

Con varias filas seleccionadas y **"Pagar"** se abre **"Liquidación y Pago en Lote"**:
- Muestra el **total a liquidar** y agrupa los comprobantes **por solicitante** (cada uno recibe su propio correo con el desglose).
- **"Enviar aviso de liquidación por email a los solicitantes"** (recomendado, activado por defecto) con la lista de destinatarios.
- Podés adjuntar **un único comprobante de transferencia** que se envía en todos los correos.
- Opción **"Aplica retenciones"**.
- **"Confirmar y Pagar (N)"** marca todos como Pagados y envía los correos.

> **Diferencia técnica:** el pago **individual** archiva la constancia en Google Drive; el pago **en lote** adjunta la constancia a los correos y la guarda en los registros, pero **no la sube a la carpeta de Drive**. Si necesitás la constancia en Drive, usá el pago individual o subila luego.

### 7.5 Retenciones: certificado de retenciones

Cuando un pago se marcó con **"Aplica Retenciones"**, queda en estado **"Pagado - Pend. Retención"** (naranja). Al hacer clic en ese estado se abre **"Cargar Certificado de Retenciones"**:
- Adjuntá el **certificado (AFIP/ARCA)** en PDF o imagen (click, arrastrar o Ctrl+V).
- **"Guardar Certificado"**: lo archiva en Drive, **envía el certificado por correo** al solicitante y pasa el comprobante a **"Pagado"** (verde) definitivo.
- Desde acá también podés **"Revertir Pago a Pendiente"**.

### 7.6 Revertir un pago

Un comprobante ya pagado puede volver a **Pendiente** (botón **"Revertir"** al pasar el mouse sobre *"Pagado"*, o desde el certificado). La reversión:
- Pide confirmación (**"Sí, revertir pago"**).
- **Envía un correo de aviso** de reversión al solicitante.
- **Elimina de Google Drive** la constancia de transferencia y el certificado de retención asociados (si existían).
- Queda registrada en el Log de Cambios.

### 7.7 Exportar CSV

En *Gestión de Pagos*, **"Exportar CSV"** descarga los comprobantes seleccionados (o todos los filtrados) a una planilla, ideal para conciliaciones y contabilidad.

### 7.8 Proveedores

La pestaña **"Proveedores"** es el **catálogo oficial** con sus **cuentas bancarias**, que alimenta la opción *Pago a Proveedor*.

- **Tarjetas de estadística:** cantidad de proveedores y facturación total registrada.
- **Buscar / Ordenar:** por nombre, CUIT, email, alias o CBU; orden alfabético, por fecha, por facturación o por cantidad de comprobantes.
- **Nuevo Proveedor** (formulario): *Nombre o Razón Social* (obligatorio), *CUIT/CUIL*, **datos bancarios** (Alias, CBU/CVU, Banco, Tipo de Cuenta, Moneda) y observaciones.
  - **Lectura con IA:** se puede adjuntar una *Constancia de CUIT* o comprobante bancario (PDF/imagen o Ctrl+V) y la IA completa los campos.
  - **Controles:** alias y CBU/CVU **duplicados están prohibidos**; un CUIT duplicado se permite solo tildando una confirmación.
- **Importar CSV:** pegá filas desde Google Sheets/Excel o subí un archivo `.csv/.tsv`. Detecta columnas y duplicados y muestra una previsualización antes de importar.
- **Ver gastos de un proveedor:** botón **"Gastos"** lleva a *Gestión de Pagos* filtrado por ese proveedor.
- **Eliminar:** si el proveedor tiene comprobantes vinculados, la aplicación **desvincula los datos de cuenta** de esos comprobantes pero **conserva el nombre/factura**.

### 7.9 Centros de Costos

La pestaña **"Centro de Costos"** gestiona las **siglas** y su vínculo con **carpetas de Google Drive**.
- **Nuevo Centro de Costos:** *Sigla* (mayúsculas, hasta 8 caracteres), *Nombre* (obligatorio), *Link de Google Drive* (pegás la URL de la carpeta y el nombre se detecta solo) y *Emails en copia* (las personas que se ponen en CC de todo correo relacionado con ese centro de costos).
- **Tabla:** Sigla (clic para copiar), Nombre, Emails en Copia, Carpeta/Link de Drive y acciones (editar en línea / eliminar).

> Los **totales por centro de costos** no se muestran en esta pestaña; se obtienen exportando o filtrando en *Gestión de Pagos*.

### 7.10 Usuarios y Roles

La pestaña **"Usuarios / Roles"** administra quién puede entrar y con qué permisos.
- **Habilitar Usuario / Admin:** *Correo (Google)* obligatorio, *Nombre*, **Rol** (Administrador / Finanzas o Colaborador / Rendidor) y opción **"Poner en copia en emails salientes"** (CC global).
- **Tabla:** cada usuario con su rol (botones **Admin** / **Colaborador** que cambian el rol al instante), el toggle de CC en emails, notas y fecha.
- Al dar de alta un usuario se le envía un **correo de bienvenida** automático.
- **Eliminar** un usuario le quita el acceso (volvería a entrar como colaborador solo si un admin lo rehabilita).

> **Administradores predefinidos** (siempre con acceso, aunque no figuren en la lista): `admin@isf-argentina.org`, `alevy@isf-argentina.org`, `finanzas@isf-argentina.org` y la cuenta Google del propietario técnico.

### 7.11 Sistema y Métricas

La pestaña **"Sistema"** es el tablero operativo (uso y costos), con actualización automática cada 30 segundos.
- **KPIs:** espacio ocupado en Firestore (sobre 1 GB), gasto de APIs del mes actual y anterior, y la variación intermensual.
- **Espacio Firestore:** cuánto pesa cada colección de datos. (Las imágenes pesadas viven en Drive, no en Firestore.)
- **Consumo de APIs:** costos de **Gemini (IA/OCR)**, **Google Drive**, **Gmail** y **Firestore**, con conversión USD→ARS.
- **Estado de servicios:** salud de cada integración (Operativo / Configurado).
- **Auditoría de llamadas:** registro cronológico de cada llamada a las APIs (con opción de limpiar logs).

### 7.12 Log de Cambios y Auditoría

La pestaña **"Log de Cambios"** registra **en tiempo real** todo lo que se crea, modifica o elimina en Centros de Costos, Proveedores, Comprobantes, Categorías y Usuarios.
- **Contadores rápidos** (total de eventos, hoy, por módulo).
- **Filtros:** búsqueda, período (Hoy / 7 / 30 días / Todos) y por módulo.
- **Detalle campo a campo:** cada evento se puede expandir para ver el **valor anterior → valor nuevo**.
- **Exportar CSV** de la auditoría.
- **"Inicializar y Borrar Log"** (solo administradores): operación irreversible que vacía el historial (deja un registro de quién lo hizo).

---

## 8. Cómo funciona por detrás (arquitectura)

*(Sección orientativa para administradores técnicos.)*

La aplicación es un frontend **React + TypeScript** servido junto a un backend **Express** (`server.ts`) que actúa como intermediario centralizado hacia los servicios de Google. Los datos estructurados viven en **Firebase Firestore**.

### 8.1 Inteligencia Artificial (Google Gemini)
- Lee facturas/tickets (OCR), constancias de proveedores, y puede procesar audio y texto.
- **Modelo:** `gemini-3.7-flash` como principal, con respaldo automático a variantes más livianas si hay saturación.
- **Costos registrados:** ~US$ 0,10 por millón de tokens de entrada y ~US$ 0,40 por millón de salida. Cada operación queda registrada para el tablero de costos (conversión a ARS con tipo de cambio fijo configurado).

### 8.2 Archivo en Google Drive
- Cada **centro de costos** tiene su **carpeta propia** en Drive.
- **Nomenclatura de archivos:** `SIGLA-Nombre Solicitante-AAAAMMDD-Monto.ext` (ej. `GPA-Juan Perez-20260514-15400.pdf`). Los comprobantes de pago llevan el sufijo `-ComprobantePago-` y los certificados `-CertificadoRetencion-`.
- Todo se sube de forma **centralizada en nombre de la cuenta institucional maestra** (`admin@isf-argentina.org`), usando un *refresh token* guardado en el servidor. Así, ningún colaborador necesita acceso propio a Drive. Soporta Unidades Compartidas.

### 8.3 Correos (Gmail API)
- Todos los correos son plantillas HTML institucionales, enviadas priorizando la cuenta central para mantener la identidad de ISF.
- **Copia (CC) automática:** se combinan (1) usuarios marcados como "copiar en todos los correos", (2) los emails configurados en el centro de costos del gasto y (3) cualquier CC explícito. Se quita al destinatario principal y se eliminan duplicados.

### 8.4 Base de datos (Firestore)
- **Centralizada y compartida:** todos ven el mismo conjunto de datos, **sincronizado en tiempo real** entre dispositivos.
- **Colecciones:** `expenses` (comprobantes), `vendors` (proveedores), `cost_centers`, `categories`, `app_users` (usuarios y roles), `user_preferences`, `audit_logs`, `api_usage_logs`, `system_health`.
- **Las imágenes/archivos binarios nunca se guardan en Firestore**, solo en Drive; en Firestore quedan los datos livianos y los enlaces.

### 8.5 Autenticación
- **Usuarios:** Google OAuth con permisos mínimos (identidad, email, perfil).
- **Operaciones sobre Drive/Gmail:** centralizadas en el servidor con un *refresh token* maestro guardado en variables de entorno (`GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). La clave de Gemini se guarda como `GEMINI_API_KEY`.

---

## 9. Seguridad y privacidad

- **Acceso restringido:** solo entran los correos habilitados. El control de roles se hace a nivel de aplicación (colección `app_users`).
- **Datos bancarios:** se usan exclusivamente para reintegros y transferencias. La política de privacidad de la app aclara que **no se venden ni ceden** datos personales a terceros.
- **Permisos de Google mínimos** para los usuarios; las operaciones sensibles (Drive/Gmail) las hace el servidor con la cuenta institucional.
- **Trazabilidad:** cada cambio relevante queda en el Log de Cambios y cada llamada a API en la auditoría del sistema.
- **Nota técnica:** las reglas de Firestore actuales (`firestore.rules`) permiten lectura/escritura sin restricción a nivel de base de datos; la seguridad efectiva depende del control de acceso de la aplicación. Es recomendable endurecer esas reglas si el proyecto crece.
- **Documentos legales:** desde el pie de página se accede a la **Política de Privacidad** y a los **Términos y Condiciones**. Contacto institucional: `admin@isf-argentina.org`.

---

## 10. Preguntas frecuentes y resolución de problemas

**No puedo iniciar sesión / "Acceso denegado".**
Tu correo no está habilitado. Pedile a un administrador que te agregue en *Usuarios / Roles*.

**Cargué un comprobante pero no puedo editarlo (aparece un candado).**
Ya fue pagado. Los comprobantes pagados quedan bloqueados. Si hay que corregirlo, Administración puede **revertir el pago** a pendiente y luego editarlo.

**La IA no detectó el monto o la fecha.**
La fila queda marcada como *"Falta Monto o Fecha"*. Completá esos campos a mano en la tabla y guardá. Podés usar **"Reintentar"** para reanalizar.

**Salió un aviso de que la factura "no es CUIT ISF".**
El comprobante no figura a nombre de Ingeniería Sin Fronteras. Verificá el destinatario; podés continuar igual con **"Aceptar"** si corresponde.

**El comprobante dice "Fallo Drive".**
La subida a Google Drive falló. Usá **"Reintentar"** en la fila. El dato contable ya quedó guardado igual.

**¿Dónde quedan archivadas las fotos de las facturas?**
En la **carpeta de Google Drive del centro de costos** correspondiente, con nombre estandarizado. Se accede desde el ícono de carpeta en la fila o desde el visor.

**Necesito reintegrar a alguien pero no tengo su CBU.**
Usá **"Pedir Datos"** en *Gestión de Pagos* para enviarle el pedido por correo.

**¿Puedo pagar muchos comprobantes juntos?**
Sí: seleccioná varias filas en *Gestión de Pagos* y usá **"Pagar"** (pago en lote).

---

## 11. Anexos

### 11.1 Categorías de gasto (por defecto)
Materiales de Construcción e Instalación · Herramientas y Equipamiento · Transporte, Combustible y Peajes · Alojamiento y Hospedaje · Alimentos y Viáticos · Honorarios y Servicios Profesionales · Librería, Impresiones y Papelería · Comunicaciones, Envíos y Telefonía · Eventos, Talleres y Capacitación · Servicios Básicos y Mantenimiento · Insumos y Papelería de Oficina · Otros Gastos Operativos.

### 11.2 Centros de costos (siglas de ejemplo, precargados)
`ALSE` Alquileres y Servicios Sedes · `CAHO`/`CAMA` Campaña Vía Pública · `CAPA` Capacitación Staff · `CAPO` Caranchi Pozo · `UNLAM` Curso UNLaM · `UTNBA` Curso UTN · `COES` Complejo Esperanza · `GADM` Gastos de Administración · `DIFU` Gastos de Difusión · `GAEV` Gastos Eventos · `GOFI` Gastos Oficina · `GTOR` Gastos Organización · `GAPL` Gastos Plataformas · `GPA` Gastos Proyectos de Agua · `GPMS` Gastos Proyectos (Materiales y Servicios) · `GRAM` Gramilla‑Herrera · `HONO` Honorarios · `AURO` Isauro‑La Boca · `ETER` Libertad Eterna‑Tigre · `MOEV` Movilidad Eventos · `SEAP` SEAP Crece desde Abajo · `SEPAU` Seguros y Patentes Autos · `SECO` Seminario Co Diseño · `SEAA` Service y Arreglos Autos · `SECC` Servicios para Call · `TELE` Teléfono · `VIPR` Viajes a Proyectos · `VIAT` Viáticos Staff · `PACO` Paso Grande y Copo · `U47` U47 Espacio para las Infancias.
*(El catálogo real se administra desde la pestaña Centro de Costos.)*

### 11.3 Estados de un comprobante
- **Pendiente** — falta liquidar el reintegro o el pago al proveedor.
- **Pagado** — reintegro/pago confirmado.
- **Pagado - Pend. Retención** — pagado, falta subir el certificado de retención.
- **Directo** — pago institucional (tarjeta corporativa o débito Galicia); no requiere reintegro.

### 11.4 Versionado
La versión se muestra en el pie de página (`v2.5.9`). Toda modificación al proyecto debe incrementar el número de versión en `src/version.ts` y `package.json` (según la política del repositorio).

---

*Manual generado a partir del código fuente del repositorio `factura_isf`. Ante dudas de negocio, la fuente de verdad es el comportamiento de la aplicación y el equipo de Administración y Finanzas de ISF Argentina.*
