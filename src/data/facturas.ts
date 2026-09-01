export interface FacturaPastry {
  id: string;
  name: string;
  shortName: string;
  description: string;
  accentColor: string;
  badgeBg: string;
}

export const FACTURAS_LIST: FacturaPastry[] = [
  {
    id: 'medialuna_manteca',
    name: 'Medialuna de manteca',
    shortName: 'Medialuna de manteca',
    description: 'Dorada, esponjosa y brillante con almíbar artesanal',
    accentColor: '#D97706',
    badgeBg: '#FEF3C7',
  },
  {
    id: 'medialuna_grasa',
    name: 'Medialuna de grasa',
    shortName: 'Medialuna de grasa',
    description: 'Fina, alargada, crocante y con el tostado perfecto',
    accentColor: '#B45309',
    badgeBg: '#FDE68A',
  },
  {
    id: 'vigilante',
    name: 'Vigilante',
    shortName: 'Vigilante',
    description: 'Con crema pastelera amarilla y dulce de membrillo',
    accentColor: '#DC2626',
    badgeBg: '#FEE2E2',
  },
  {
    id: 'tortita_negra',
    name: 'Tortita negra',
    shortName: 'Tortita negra',
    description: 'Masa tierna cubierta de abundante azúcar morena y negra',
    accentColor: '#451A03',
    badgeBg: '#E7E5E4',
  },
  {
    id: 'bola_de_fraile',
    name: 'Bola de fraile',
    shortName: 'Bola de fraile',
    description: 'Berlinesa dorada, azucarada y con corazón de dulce de leche',
    accentColor: '#92400E',
    badgeBg: '#FFEDD5',
  },
  {
    id: 'canoncito',
    name: 'Cañoncito',
    shortName: 'Cañoncito con DDL',
    description: 'Hojaldre crocante repleto de dulce de leche colonial',
    accentColor: '#78350F',
    badgeBg: '#FEF3C7',
  },
  {
    id: 'churro',
    name: 'Churro',
    shortName: 'Churro',
    description: 'Estriado, crujiente por fuera y espolvoreado con azúcar',
    accentColor: '#D97706',
    badgeBg: '#FEF3C7',
  },
  {
    id: 'sacramento',
    name: 'Sacramento',
    shortName: 'Sacramento',
    description: 'Rulo hojaldrado con toque de membrillo y corteza dulce',
    accentColor: '#B91C1C',
    badgeBg: '#FEE2E2',
  },
  {
    id: 'cremona',
    name: 'Cremona',
    shortName: 'Cremona',
    description: 'Tradicional rosca criolla de hojaldre con bordes dentados',
    accentColor: '#CA8A04',
    badgeBg: '#FEF9C3',
  },
  {
    id: 'librito',
    name: 'Librito',
    shortName: 'Librito de grasa',
    description: 'Hojaldre doblado en finas láminas abiertas al calor del horno',
    accentColor: '#A16207',
    badgeBg: '#FEF08A',
  },
  {
    id: 'miguelito',
    name: 'Miguelito',
    shortName: 'Miguelito',
    description: 'Pancito suave abierto, dulce de leche y lluvia de azúcar impalpable',
    accentColor: '#854D0E',
    badgeBg: '#F3F4F6',
  },
  {
    id: 'chipa',
    name: 'Chipá',
    shortName: 'Chipá correntino',
    description: 'Bocadito caliente de fécula de mandioca con abundante queso',
    accentColor: '#EA580C',
    badgeBg: '#FFEDD5',
  },
];

export function getRandomFactura(): FacturaPastry {
  const randomIndex = Math.floor(Math.random() * FACTURAS_LIST.length);
  return FACTURAS_LIST[randomIndex];
}
