import { Expense, Vendor, CostCenter } from '../types';

export const DEFAULT_CATEGORIES = [
  'Materiales de Construcción e Instalación',
  'Herramientas y Equipamiento',
  'Transporte, Combustible y Peajes',
  'Alojamiento y Hospedaje',
  'Alimentos y Viáticos',
  'Honorarios y Servicios Profesionales',
  'Librería, Impresiones y Papelería',
  'Comunicaciones, Envíos y Telefonía',
  'Eventos, Talleres y Capacitación',
  'Servicios Básicos y Mantenimiento',
  'Insumos y Papelería de Oficina',
  'Otros Gastos Operativos',
];

export const DEFAULT_COST_CENTERS_DATA: CostCenter[] = [
  {
    id: 'cc-1',
    name: 'Alquileres y Servicios Sedes',
    code: 'ALSE',
    driveFolder: 'Alquileres y Servicios Sede 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1nQ86iSlfPqsl5nq5tX1OxeZmBptOJgYX?usp=sharing',
    active: true,
  },
  {
    id: 'cc-2',
    name: 'Campaña Vía Pública (Honorarios y Viáticos)',
    code: 'CAHO',
    driveFolder: 'Campaña Vía Pública (Honorarios y Viáticos) 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1_5Rb3leyr187oXFYjr6gDnYaGPea2VXs?usp=sharing',
    active: true,
  },
  {
    id: 'cc-3',
    name: 'Campaña en vía pública (Materiales, Entrevistas, Ropa)',
    code: 'CAMA',
    driveFolder: 'Campaña en vía pública (Materiales, Ropa, etc) 2026',
    driveUrl: 'https://drive.google.com/drive/folders/12oUe4cgu_HCDxfrPX6hxeHoCgigZOhej?usp=sharing',
    active: true,
  },
  {
    id: 'cc-4',
    name: 'Capacitación Staff',
    code: 'CAPA',
    driveFolder: 'Capacitación Staff 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1YrZ-defH_2o8X1Z5INwrOCWpiPZi3zWS?usp=sharing',
    active: true,
  },
  {
    id: 'cc-5',
    name: 'Caranchi Pozo',
    code: 'CAPO',
    driveFolder: 'Caranchi Pozo 206',
    driveUrl: 'https://drive.google.com/drive/folders/1g2x1dy98gwUzERCU0wup67WkmG5VS_EG?usp=sharing',
    active: true,
  },
  {
    id: 'cc-6',
    name: 'Curso UNLaM',
    code: 'UNLAM',
    driveFolder: 'Diplomatura Unlam 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1XdW_LhIZ1wBLqNrvrUZ9LUPULyntj2FZ?usp=sharing',
    active: true,
  },
  {
    id: 'cc-7',
    name: 'Curso UTN',
    code: 'UTNBA',
    driveFolder: 'Diplomatura UTN 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1aQc0wXhgfAbY4SmbK3MWsIBLX9y9ADFe?usp=sharing',
    active: true,
  },
  {
    id: 'cc-8',
    name: 'Complejo Esperanza',
    code: 'COES',
    driveFolder: 'Complejo Esperanza 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1XdW_LhIZ1wBLqNrvrUZ9LUPULyntj2FZ?usp=sharing',
    active: true,
  },
  {
    id: 'cc-9',
    name: 'Gastos de Administracion',
    code: 'GADM',
    driveFolder: 'Gastos de Administracion 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1nXq9IVqQjW-LUrIJVda3QsJ2edW-tHfk?usp=sharing',
    active: true,
  },
  {
    id: 'cc-10',
    name: 'Gastos de difusión',
    code: 'DIFU',
    driveFolder: 'Difusion 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1Hx1viHbjbX2om3apuhCJ7nb6LhmV70JP?usp=sharing',
    active: true,
  },
  {
    id: 'cc-11',
    name: 'Gastos Eventos',
    code: 'GAEV',
    driveFolder: 'Gastos Eventos 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1laWSTAqv-OmTmbbLFhwqQHLrol9QqI5M?usp=sharing',
    active: true,
  },
  {
    id: 'cc-12',
    name: 'Gastos oficina',
    code: 'GOFI',
    driveFolder: 'Gastos de Oficina 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1efDEmNgOeBi6hgFlC4mWZkEfmi5_YF9f?usp=sharing',
    active: true,
  },
  {
    id: 'cc-13',
    name: 'Gastos Organización',
    code: 'GTOR',
    driveFolder: 'Gastos Organización 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1vaIxNlDK4q8pkmt24kEBO8fZA75sPRvu?usp=sharing',
    active: true,
  },
  {
    id: 'cc-14',
    name: 'Gastos Plataformas',
    code: 'GAPL',
    driveFolder: 'Gastos Plataformas 2026',
    driveUrl: 'https://drive.google.com/drive/folders/11jxebI9h38zZhVhKz4xfAEvDzVwXhTnK?usp=sharing',
    active: true,
  },
  {
    id: 'cc-15',
    name: 'Gastos Proyectos de Agua',
    code: 'GPA',
    driveFolder: 'Gastos Proyectos de Agua 2026',
    driveUrl: 'https://drive.google.com/drive/folders/14GOtm0euSCfVNCH5Vz_j7QL3DYUhI50a?usp=sharing',
    active: true,
  },
  {
    id: 'cc-16',
    name: 'Gastos Proyectos (materiales y servicios)',
    code: 'GPMS',
    driveFolder: 'Gastos Proyectos (Materiales y Servicios) 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1HGmqgPiut-_4VrqUCo9W2dh7453RZP7L?usp=sharing',
    active: true,
  },
  {
    id: 'cc-17',
    name: 'Gramilla-Herrera',
    code: 'GRAM',
    driveFolder: 'Gramilla 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1a6rh5rBp0t4dctG_qr-EX2OPGci5RKkN?usp=sharing',
    active: true,
  },
  {
    id: 'cc-18',
    name: 'Honorarios (Contadora, Escribana, etc)',
    code: 'HONO',
    driveFolder: 'Honorarios 2026 (contador-escribanía-otros)',
    driveUrl: 'https://drive.google.com/drive/folders/1L_-uzcK6hakmfqmpa5K_RNu-QevoYYHf?usp=sharing',
    active: true,
  },
  {
    id: 'cc-19',
    name: 'Isauro-La Boca',
    code: 'AURO',
    driveFolder: 'Isauro-La Boca 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1i_8KTBwM863WnaQQxSyygYlxps04PFkK?usp=sharing',
    active: true,
  },
  {
    id: 'cc-20',
    name: 'Libertad Eterna-Tigre',
    code: 'ETER',
    driveFolder: 'Libertad Eterna-Tigre 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1UoGj5SyXGzKjVJrYv7wVYbgjWUfZu-A3?usp=sharing',
    active: true,
  },
  {
    id: 'cc-21',
    name: 'Movilidad Eventos',
    code: 'MOEV',
    driveFolder: 'Movilidad Eventos 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1Pxyuh4vUmeMCsjPVuz0DVob-ehYyOlRW?usp=sharing',
    active: true,
  },
  {
    id: 'cc-22',
    name: 'SEAP - Crece desde Abajo',
    code: 'SEAP',
    driveFolder: 'SEAP Crece desde Abajo - CBA 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1zRQJLY8jDRsMHWxsSYYn-uSVCfnb3pdS?usp=sharing',
    active: true,
  },
  {
    id: 'cc-23',
    name: 'Seguros y Patentes Autos',
    code: 'SEPAU',
    driveFolder: 'Seguros y Patentes Autos 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1ZSYwnlzoWj_9uGss2nTimM7NW4LBkLto?usp=sharing',
    active: true,
  },
  {
    id: 'cc-24',
    name: 'Seminario Co Diseño',
    code: 'SECO',
    driveFolder: 'Seminario Co Diseño 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1FLAslxlxvJFpSS-lJyKR3YHR8d0_S_2A?usp=sharing',
    active: true,
  },
  {
    id: 'cc-25',
    name: 'Service y Arreglos Autos',
    code: 'SEAA',
    driveFolder: 'Service y Arreglos Autos 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1EmHsABuWwOl_hyQGsQyh_AHzoWUoOAwh?usp=sharing',
    active: true,
  },
  {
    id: 'cc-26',
    name: 'Servicios para Call (plataformas, teléfonos)',
    code: 'SECC',
    driveFolder: 'Servicios para Call 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1Jf50TO3U6qEoCXVay8CXgRRqX2O-WuW1?usp=sharing',
    active: true,
  },
  {
    id: 'cc-27',
    name: 'Teléfono',
    code: 'TELE',
    driveFolder: 'Telefono 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1BAmy79i1rcdoKj_blvaCeHLGTxeaKm8a?usp=sharing',
    active: true,
  },
  {
    id: 'cc-28',
    name: 'Viajes a Proyectos',
    code: 'VIPR',
    driveFolder: 'Viajes a Proyectos 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1_Ofl3_vwaRzEy7tspOGRXbalBd4Mvj5W?usp=sharing',
    active: true,
  },
  {
    id: 'cc-29',
    name: 'Viáticos Staff',
    code: 'VIAT',
    driveFolder: 'Viaticos Staff 2026',
    driveUrl: 'https://drive.google.com/drive/folders/13Fmfe_3jSH7luBZAB6V9NXpF8jrMIRZC?usp=sharing',
    active: true,
  },
  {
    id: 'cc-30',
    name: 'Paso Grande y Copo',
    code: 'PACO',
    driveFolder: 'Paso Grande y Copo 2026',
    driveUrl: 'https://drive.google.com/drive/folders/1ukm1UZof55Za5xuYf01MOPdlG9xCapCh?usp=sharing',
    active: true,
  },
  {
    id: 'cc-31',
    name: 'U47 Espacio para las Infancias',
    code: 'U47',
    driveFolder: 'U47 Espacio para las Infancias',
    driveUrl: 'https://drive.google.com/drive/folders/1nKhmISyCt4L0Oe9y_tTkeCUI8u86533J?usp=sharing',
    active: true,
  },
];

export const DEFAULT_COST_CENTERS: string[] = DEFAULT_COST_CENTERS_DATA.map((c) => c.name);

export const DEFAULT_PROJECTS = DEFAULT_COST_CENTERS;

export const DEFAULT_VENDORS: Vendor[] = [];

export const SAMPLE_RECEIPTS = [
  {
    name: 'Ticket Restaurante La Cabrera',
    vendor: 'La Cabrera Norte S.A.',
    amount: 34500,
    currency: 'ARS',
    date: '2026-08-20',
    invoiceNumber: 'B-0004-00029148',
    category: 'Alimentos y Viáticos',
    project: 'Gastos Proyectos de Agua',
    reimbursable: true,
    reimbursementStatus: 'PENDING',
    paymentMethod: 'Tarjeta de Débito',
    notes: 'Almuerzo técnico de coordinación con ingenieros de obra en campo.',
    audioText: 'Este gasto fue un almuerzo con el equipo técnico de campo para Gastos Proyectos de Agua. Pagué con mi tarjeta de débito personal, corresponde reintegro.',
    svgData: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600" style="background:%23fffdf7; font-family:monospace;">
      <rect width="100%" height="100%" fill="%23fffdf7" stroke="%23d4d4d8" stroke-width="2"/>
      <text x="200" y="45" font-size="18" font-weight="bold" text-anchor="middle" fill="%2318181b">LA CABRERA NORTE S.A.</text>
      <text x="200" y="70" font-size="11" text-anchor="middle" fill="%2371717a">CUIT: 30-71089945-8 | Av. Santa Fe 3420</text>
      <text x="200" y="90" font-size="11" text-anchor="middle" fill="%2371717a">IVA RESPONSABLE INSCRIPTO</text>
      <line x1="20" y1="105" x2="380" y2="105" stroke="%23000" stroke-dasharray="4 4"/>
      <text x="30" y="130" font-size="13" font-weight="bold" fill="%2318181b">FACTURA 'B' N° 0004-00029148</text>
      <text x="30" y="150" font-size="12" fill="%233f3f46">FECHA: 20/08/2026  HORA: 14:15</text>
      <text x="30" y="170" font-size="12" fill="%233f3f46">CAE: 74349182390192  VTO: 30/08/2026</text>
      <line x1="20" y1="185" x2="380" y2="185" stroke="%23000" stroke-dasharray="4 4"/>
      <text x="30" y="210" font-size="12" font-weight="bold">CANT DESCRIPCIÓN         P.UNIT    TOTAL</text>
      <text x="30" y="240" font-size="11">2    MENU EJECUTIVO     $13.500  $27.000</text>
      <text x="30" y="265" font-size="11">2    BEBIDA SIN ALCOHOL  $ 2.500  $ 5.000</text>
      <text x="30" y="290" font-size="11">2    CAFE EXPRESSO       $ 1.250  $ 2.500</text>
      <line x1="20" y1="320" x2="380" y2="320" stroke="%23000" stroke-dasharray="4 4"/>
      <text x="30" y="350" font-size="12" fill="%233f3f46">Subtotal Gravado: $28.512,40</text>
      <text x="30" y="375" font-size="12" fill="%233f3f46">IVA (21%): $5.987,60</text>
      <text x="30" y="420" font-size="18" font-weight="bold" fill="%2309090b">TOTAL PAGADO:   $ 34.500,00</text>
      <line x1="20" y1="440" x2="380" y2="440" stroke="%23000" stroke-dasharray="4 4"/>
      <text x="200" y="475" font-size="12" text-anchor="middle" fill="%233f3f46">FORMA DE PAGO: TARJETA DEBITO</text>
      <text x="200" y="520" font-size="11" text-anchor="middle" fill="%23a1a1aa">GRACIAS POR SU COMPRA</text>
      <text x="200" y="540" font-size="9" text-anchor="middle" fill="%23d4d4d8">COMPROBANTE AUTORIZADO POR AFIP</text>
    </svg>`,
  },
  {
    name: 'Ticket Combustible YPF',
    vendor: 'Estación de Servicio YPF Ruta 9',
    amount: 48900,
    currency: 'ARS',
    date: '2026-08-22',
    invoiceNumber: 'A-0012-00084120',
    category: 'Transporte, Combustible y Peajes',
    project: 'Gastos de Administracion',
    reimbursable: true,
    reimbursementStatus: 'PENDING',
    paymentMethod: 'Efectivo',
    notes: 'Carga de Infinia Nafta para traslado interurbano de supervisión.',
    audioText: 'Cargué nafta en la YPF para viajar a la reunión de Gastos de Administracion. Pagué en efectivo 48900 de mis fondos personales, solicito reintegro.',
    svgData: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560" style="background:%23fafafa; font-family:monospace;">
      <rect width="100%" height="100%" fill="%23fafafa" stroke="%23e4e4e7" stroke-width="2"/>
      <text x="200" y="45" font-size="20" font-weight="bold" text-anchor="middle" fill="%230284c7">YPF S.A. RED XXI</text>
      <text x="200" y="70" font-size="11" text-anchor="middle" fill="%2352525b">Estación de Servicio N° 8412 - Ruta 9 Km 48</text>
      <text x="200" y="90" font-size="11" text-anchor="middle" fill="%2352525b">CUIT: 30-54668997-9</text>
      <line x1="20" y1="110" x2="380" y2="110" stroke="%23000" stroke-dasharray="3 3"/>
      <text x="30" y="135" font-size="13" font-weight="bold">FACTURA 'A' N° 0012-00084120</text>
      <text x="30" y="155" font-size="11">FECHA: 22/08/2026 09:34 HS</text>
      <line x1="20" y1="175" x2="380" y2="175" stroke="%23000" stroke-dasharray="3 3"/>
      <text x="30" y="200" font-size="12">DESCRIPCION: INFINIA NAFTA</text>
      <text x="30" y="225" font-size="12">VOLUMEN: 36.22 Litros  x $ 1.350,00</text>
      <text x="30" y="260" font-size="11">Neto Gravado: $40.413,22</text>
      <text x="30" y="280" font-size="11">IVA 21%: $8.486,78</text>
      <line x1="20" y1="310" x2="380" y2="310" stroke="%23000" stroke-dasharray="3 3"/>
      <text x="30" y="350" font-size="18" font-weight="bold" fill="%230f172a">TOTAL:  $ 48.900,00</text>
      <text x="30" y="380" font-size="12">PAGO: CONTADO EFECTIVO</text>
      <line x1="20" y1="410" x2="380" y2="410" stroke="%23000" stroke-dasharray="3 3"/>
      <text x="200" y="445" font-size="11" text-anchor="middle" fill="%2364748b">SERVICLUB N° 4589 **** **** 1029</text>
      <text x="200" y="470" font-size="10" text-anchor="middle" fill="%2394a3b8">AFIP CAE 7681923091012</text>
    </svg>`,
  },
  {
    name: 'Ticket Librería & Papelería',
    vendor: 'Librería & Papelería Central',
    amount: 18200,
    currency: 'ARS',
    date: '2026-08-18',
    invoiceNumber: 'B-0001-00015402',
    category: 'Librería, Impresiones y Papelería',
    project: 'Capacitación Staff',
    reimbursable: false,
    reimbursementStatus: 'NOT_APPLICABLE',
    paymentMethod: 'Tarjeta de Crédito',
    notes: 'Carpetas, marcadores y resmas para el taller de inducción.',
    audioText: 'Compré insumos de librería para Capacitación Staff. Lo aboné con la tarjeta corporativa de la organización, no requiere reintegro.',
    svgData: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520" style="background:%23fffbeb; font-family:monospace;">
      <rect width="100%" height="100%" fill="%23fffbeb" stroke="%23fef3c7" stroke-width="2"/>
      <text x="200" y="45" font-size="17" font-weight="bold" text-anchor="middle" fill="%2392400e">LIBRERIA CENTRAL S.R.L.</text>
      <text x="200" y="70" font-size="11" text-anchor="middle" fill="%2378350f">San Martín 650 - CABA</text>
      <line x1="20" y1="95" x2="380" y2="95" stroke="%23000" stroke-dasharray="2 2"/>
      <text x="30" y="120" font-size="12">FACTURA B 0001-00015402</text>
      <text x="30" y="140" font-size="11">FECHA: 18/08/2026 11:10</text>
      <line x1="20" y1="160" x2="380" y2="160" stroke="%23000" stroke-dasharray="2 2"/>
      <text x="30" y="185" font-size="11">2x RESMA A4 75GR          $11.000</text>
      <text x="30" y="210" font-size="11">1x SET MARCADORES PIZARRA $ 4.200</text>
      <text x="30" y="235" font-size="11">10x CARPETAS COLGANTES    $ 3.000</text>
      <line x1="20" y1="265" x2="380" y2="265" stroke="%23000" stroke-dasharray="2 2"/>
      <text x="30" y="300" font-size="17" font-weight="bold" fill="%23451a03">TOTAL A PAGAR: $ 18.200,00</text>
      <text x="30" y="330" font-size="12">PAGO: TARJETA VISA CORPORATIVA</text>
      <line x1="20" y1="360" x2="380" y2="360" stroke="%23000" stroke-dasharray="2 2"/>
      <text x="200" y="400" font-size="10" text-anchor="middle" fill="%23b45309">DOCUMENTO NO FISCAL EMITIDO ELECTRONICAMENTE</text>
    </svg>`,
  },
];

export const INITIAL_EXPENSES: Expense[] = [];
