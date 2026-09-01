import React, { useState, useEffect } from 'react';
import { FACTURAS_LIST, FacturaPastry, getRandomFactura } from '../data/facturas';
import { Sparkles, RefreshCw } from 'lucide-react';

interface FacturaIconProps {
  facturaId?: string;
  className?: string;
  size?: number | string;
  showBadge?: boolean;
  interactive?: boolean;
  onFacturaChange?: (factura: FacturaPastry) => void;
}

export function FacturaIllustration({
  id,
  className = "w-full h-full",
}: {
  id: string;
  className?: string;
}) {
  switch (id) {
    case 'medialuna_manteca':
      // Golden, shiny crescent with syrup sheen
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="mlmGrad" x1="10" y1="12" x2="54" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE047" />
              <stop offset="0.35" stopColor="#F59E0B" />
              <stop offset="0.75" stopColor="#D97706" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
            <linearGradient id="mlmSyrup" x1="20" y1="16" x2="44" y2="36" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFBEB" stopOpacity="0.8" />
              <stop offset="1" stopColor="#FBBF24" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {/* Shadow */}
          <ellipse cx="32" cy="53" rx="22" ry="5" fill="#000000" fillOpacity="0.12" />
          {/* Main Crescent Body */}
          <path
            d="M 12 44 C 9 32 15 16 32 16 C 49 16 55 32 52 44 C 50 48 44 48 42 43 C 38 32 26 32 22 43 C 20 48 14 48 12 44 Z"
            fill="url(#mlmGrad)"
            stroke="#78350F"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Dough folds / layers */}
          <path d="M 23 20 C 27 28 37 28 41 20" stroke="#78350F" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
          <path d="M 18 27 C 23 35 41 35 46 27" stroke="#78350F" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
          <path d="M 15 35 C 19 40 28 40 30 35" stroke="#78350F" strokeWidth="1.4" strokeOpacity="0.4" strokeLinecap="round" />
          <path d="M 34 35 C 36 40 45 40 49 35" stroke="#78350F" strokeWidth="1.4" strokeOpacity="0.4" strokeLinecap="round" />
          {/* Shiny Glaze Highlights */}
          <path d="M 28 18 C 34 18 38 20 42 24" stroke="url(#mlmSyrup)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="25" cy="22" r="1.5" fill="#FFFFFF" fillOpacity="0.8" />
          <circle cx="39" cy="24" r="1" fill="#FFFFFF" fillOpacity="0.8" />
        </svg>
      );

    case 'medialuna_grasa':
      // Thin, crispy, pointy horns, slightly darker golden-brown
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="mlgGrad" x1="8" y1="16" x2="56" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FBBF24" />
              <stop offset="0.4" stopColor="#D97706" />
              <stop offset="0.8" stopColor="#B45309" />
              <stop offset="1" stopColor="#78350F" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="52" rx="24" ry="4.5" fill="#000000" fillOpacity="0.12" />
          {/* Slender crescent with stretched pointy horns */}
          <path
            d="M 8 38 C 7 24 18 15 32 15 C 46 15 57 24 56 38 C 55 42 49 41 47 36 C 42 24 22 24 17 36 C 15 41 9 42 8 38 Z"
            fill="url(#mlgGrad)"
            stroke="#5A2408"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Crispy golden crust folds */}
          <path d="M 12 36 L 16 30 C 23 20 41 20 48 30 L 52 36" stroke="#451A03" strokeWidth="1.4" strokeOpacity="0.6" strokeLinecap="round" />
          <path d="M 22 23 C 27 27 37 27 42 23" stroke="#451A03" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" />
          {/* Points crispiness */}
          <path d="M 9 37 Q 14 31 20 28" stroke="#FDE68A" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.8" />
          <path d="M 55 37 Q 50 31 44 28" stroke="#FDE68A" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.8" />
        </svg>
      );

    case 'vigilante':
      // Elongated pastry with yellow crema pastelera and red dulce de membrillo
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="vigDough" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE047" />
              <stop offset="0.5" stopColor="#F59E0B" />
              <stop offset="1" stopColor="#B45309" />
            </linearGradient>
            <linearGradient id="vigMembrillo" x1="28" y1="16" x2="36" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#EF4444" />
              <stop offset="0.7" stopColor="#B91C1C" />
              <stop offset="1" stopColor="#7F1D1D" />
            </linearGradient>
            <linearGradient id="vigPastelera" x1="20" y1="16" x2="44" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FEF08A" />
              <stop offset="1" stopColor="#EAB308" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="53" rx="14" ry="4.5" fill="#000000" fillOpacity="0.12" />
          {/* Elongated Dough Bar */}
          <rect x="20" y="12" width="24" height="40" rx="12" fill="url(#vigDough)" stroke="#78350F" strokeWidth="1.8" />
          {/* Crema Pastelera stripes */}
          <path d="M 23 20 Q 32 23 41 20" stroke="url(#vigPastelera)" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M 23 42 Q 32 45 41 42" stroke="url(#vigPastelera)" strokeWidth="4.5" strokeLinecap="round" />
          {/* Dulce de Membrillo Center Stripe */}
          <rect x="28" y="16" width="8" height="30" rx="4" fill="url(#vigMembrillo)" stroke="#991B1B" strokeWidth="1.2" />
          {/* Glaze sheen */}
          <path d="M 30 19 L 30 33" stroke="#FCA5A5" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.8" />
          <circle cx="34" cy="24" r="1" fill="#FFFFFF" fillOpacity="0.8" />
        </svg>
      );

    case 'tortita_negra':
      // Round fluffy flat bun completely covered with rich dark brown/black sugar on top
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="tnDough" x1="12" y1="20" x2="52" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FEF08A" />
              <stop offset="0.6" stopColor="#F59E0B" />
              <stop offset="1" stopColor="#B45309" />
            </linearGradient>
            <radialGradient id="tnSugar" cx="32" cy="30" r="18" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3E1A07" />
              <stop offset="0.75" stopColor="#251004" />
              <stop offset="1" stopColor="#170802" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="53" rx="22" ry="5" fill="#000000" fillOpacity="0.14" />
          {/* Dough Base */}
          <path
            d="M 12 34 C 12 24 21 16 32 16 C 43 16 52 24 52 34 C 52 44 43 49 32 49 C 21 49 12 44 12 34 Z"
            fill="url(#tnDough)"
            stroke="#78350F"
            strokeWidth="1.8"
          />
          {/* Top Layer of Rich Dark Black/Brown Sugar */}
          <ellipse cx="32" cy="31" rx="17" ry="12" fill="url(#tnSugar)" stroke="#1C0A00" strokeWidth="1.2" />
          {/* Granulated texture on the black sugar */}
          <circle cx="26" cy="27" r="1.2" fill="#5A2A10" />
          <circle cx="36" cy="28" r="1.5" fill="#6B3416" />
          <circle cx="31" cy="35" r="1.2" fill="#54240C" />
          <circle cx="24" cy="33" r="1" fill="#421C08" />
          <circle cx="39" cy="33" r="1" fill="#5A2A10" />
          <circle cx="33" cy="25" r="1.3" fill="#6E3718" />
          <circle cx="28" cy="36" r="1" fill="#3D1807" />
          {/* Golden dough border rim */}
          <path d="M 15 37 C 18 45 46 45 49 37" stroke="#92400E" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );

    case 'bola_de_fraile':
      // Berlinesa: round, sugar coated with dulce de leche piping out
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <radialGradient id="bdfDough" cx="30" cy="28" r="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE047" />
              <stop offset="0.4" stopColor="#F59E0B" />
              <stop offset="0.8" stopColor="#D97706" />
              <stop offset="1" stopColor="#92400E" />
            </radialGradient>
            <radialGradient id="ddlGrad" cx="34" cy="30" r="10" gradientUnits="userSpaceOnUse">
              <stop stopColor="#A16207" />
              <stop offset="0.6" stopColor="#78350F" />
              <stop offset="1" stopColor="#451A03" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="53" rx="20" ry="5" fill="#000000" fillOpacity="0.14" />
          {/* Main fried bun sphere */}
          <circle cx="32" cy="32" r="19" fill="url(#bdfDough)" stroke="#78350F" strokeWidth="1.8" />
          {/* Sugar grains sprinkles */}
          <circle cx="22" cy="22" r="0.8" fill="#FFFFFF" />
          <circle cx="28" cy="18" r="0.8" fill="#FFFFFF" />
          <circle cx="38" cy="20" r="0.9" fill="#FFFFFF" />
          <circle cx="42" cy="26" r="0.8" fill="#FFFFFF" />
          <circle cx="20" cy="32" r="0.8" fill="#FFFFFF" />
          <circle cx="24" cy="40" r="0.8" fill="#FFFFFF" />
          {/* Dulce de Leche Heart explosion on the side/front */}
          <path
            d="M 30 27 C 30 23 37 22 41 25 C 45 28 44 35 39 37 C 35 39 29 36 30 27 Z"
            fill="url(#ddlGrad)"
            stroke="#451A03"
            strokeWidth="1.4"
          />
          {/* DDL Gloss shine */}
          <path d="M 34 26 Q 38 27 39 31" stroke="#FBBF24" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.7" />
          <circle cx="36" cy="29" r="1" fill="#FFFFFF" fillOpacity="0.7" />
        </svg>
      );

    case 'canoncito':
      // Puff pastry cylinder filled with luscious dulce de leche on the open end
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="canDough" x1="14" y1="16" x2="52" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FEF08A" />
              <stop offset="0.35" stopColor="#F59E0B" />
              <stop offset="0.75" stopColor="#D97706" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
            <radialGradient id="canDdl" cx="19" cy="33" r="8" gradientUnits="userSpaceOnUse">
              <stop stopColor="#B45309" />
              <stop offset="0.7" stopColor="#78350F" />
              <stop offset="1" stopColor="#451A03" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="52" rx="22" ry="4.5" fill="#000000" fillOpacity="0.12" />
          {/* Cylinder Body Tube */}
          <path
            d="M 18 22 L 48 24 C 52 24 55 28 55 33 C 55 38 52 42 48 42 L 18 44 Z"
            fill="url(#canDough)"
            stroke="#78350F"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Spiral Puff Pastry Rings */}
          <path d="M 26 22.5 C 29 27 29 39 26 43.5" stroke="#78350F" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 34 23 C 37 27 37 39 34 43" stroke="#78350F" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 42 23.5 C 45 27 45 38.5 42 42.5" stroke="#78350F" strokeWidth="1.6" strokeLinecap="round" />
          {/* Open Mouth with Overflowing Dulce de Leche */}
          <ellipse cx="18" cy="33" rx="7" ry="11" fill="url(#canDdl)" stroke="#5A2408" strokeWidth="1.6" />
          {/* Dulce de leche swirl highlight */}
          <path d="M 16 28 Q 19 32 17 38" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.7" />
          {/* Powdered sugar dust on top */}
          <circle cx="30" cy="25" r="0.7" fill="#FFFFFF" fillOpacity="0.9" />
          <circle cx="38" cy="26" r="0.7" fill="#FFFFFF" fillOpacity="0.9" />
          <circle cx="46" cy="27" r="0.7" fill="#FFFFFF" fillOpacity="0.9" />
        </svg>
      );

    case 'churro':
      // Ridged golden star-shaped stick, curved, with sugar coating
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="chuGrad" x1="14" y1="12" x2="50" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE047" />
              <stop offset="0.3" stopColor="#F59E0B" />
              <stop offset="0.7" stopColor="#D97706" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="53" rx="22" ry="4.5" fill="#000000" fillOpacity="0.12" />
          {/* Curved Churro Horseshoe / Arc */}
          <path
            d="M 16 46 C 13 32 16 16 32 16 C 48 16 51 32 48 46 C 44 48 39 46 41 40 C 43 30 40 23 32 23 C 24 23 21 30 23 40 C 25 46 20 48 16 46 Z"
            fill="url(#chuGrad)"
            stroke="#78350F"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Churro Characteristic Ridges / Star Estrellitas */}
          <path d="M 19 36 C 18 26 23 20 32 20 C 41 20 46 26 45 36" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 21 42 C 20 30 24 25 32 25 C 40 25 44 30 43 42" stroke="#FEF08A" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.8" />
          {/* Sugar grains */}
          <circle cx="28" cy="18" r="0.9" fill="#FFFFFF" />
          <circle cx="36" cy="18" r="0.9" fill="#FFFFFF" />
          <circle cx="20" cy="27" r="0.8" fill="#FFFFFF" />
          <circle cx="44" cy="27" r="0.8" fill="#FFFFFF" />
        </svg>
      );

    case 'sacramento':
      // Folded roll pastry with sugar glaze and quince touch
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="sacGrad" x1="14" y1="18" x2="50" y2="46" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE68A" />
              <stop offset="0.4" stopColor="#F59E0B" />
              <stop offset="0.8" stopColor="#D97706" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="52" rx="20" ry="4.5" fill="#000000" fillOpacity="0.12" />
          {/* Rolled Bun Body */}
          <path
            d="M 14 34 C 14 26 22 20 32 20 C 42 20 50 26 50 34 C 50 42 42 46 32 46 C 22 46 14 42 14 34 Z"
            fill="url(#sacGrad)"
            stroke="#78350F"
            strokeWidth="1.8"
          />
          {/* Overlapping roll folds */}
          <path d="M 16 31 C 24 24 40 24 48 31" stroke="#92400E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 20 37 C 26 31 38 31 44 37" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
          {/* Sugar and red fruit jelly drop on center */}
          <ellipse cx="32" cy="27" rx="5" ry="3.5" fill="#DC2626" stroke="#991B1B" strokeWidth="1" />
          <circle cx="31" cy="26" r="1" fill="#FFFFFF" fillOpacity="0.8" />
          {/* Coarse sugar granules */}
          <circle cx="22" cy="27" r="1.1" fill="#FFFFFF" />
          <circle cx="42" cy="27" r="1.1" fill="#FFFFFF" />
          <circle cx="32" cy="40" r="1.1" fill="#FFFFFF" />
        </svg>
      );

    case 'cremona':
      // The iconic Argentinian crown/ring with serrated/toothed puff pastry cutouts
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="cremGrad" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FEF08A" />
              <stop offset="0.4" stopColor="#EAB308" />
              <stop offset="0.75" stopColor="#CA8A04" />
              <stop offset="1" stopColor="#854D0E" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="53" rx="22" ry="5" fill="#000000" fillOpacity="0.14" />
          {/* Outer Ring with Classical Serrated/Cut Crown Teeth */}
          <path
            d="M 32 12 
               C 43 12 52 21 52 32 
               C 52 43 43 52 32 52 
               C 21 52 12 43 12 32 
               C 12 21 21 12 32 12 Z"
            fill="url(#cremGrad)"
            stroke="#713F12"
            strokeWidth="1.8"
          />
          {/* Inner Hollow Hole */}
          <circle cx="32" cy="32" r="8.5" fill="#FFFFFF" stroke="#713F12" strokeWidth="1.6" />
          {/* Radial cuts/toothed cuts around the whole ring */}
          <path d="M 32 12 L 32 23" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 46 18 L 38 26" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 52 32 L 40.5 32" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 46 46 L 38 38" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 32 52 L 32 40.5" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 18 46 L 26 38" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 12 32 L 23.5 32" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 18 18 L 26 26" stroke="#582F0E" strokeWidth="1.6" strokeLinecap="round" />
          {/* Crispy golden highlights */}
          <circle cx="32" cy="32" r="14" stroke="#FEF08A" strokeWidth="1.2" strokeOpacity="0.7" strokeDasharray="3 3" />
        </svg>
      );

    case 'librito':
      // Layered puff pastry folded like opened pages of a little book
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="libGrad" x1="14" y1="18" x2="50" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE68A" />
              <stop offset="0.4" stopColor="#F59E0B" />
              <stop offset="0.8" stopColor="#D97706" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="52" rx="20" ry="4.5" fill="#000000" fillOpacity="0.12" />
          {/* Main Rectangular Layered Biscuit */}
          <path
            d="M 14 28 L 50 24 L 48 44 L 16 46 Z"
            fill="url(#libGrad)"
            stroke="#78350F"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Multiple Open "Book Page" Hojaldre Sheets */}
          <path d="M 15 28 C 24 23 40 21 50 24" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 15 32 C 24 27 40 25 49 28" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 15 36 C 24 32 40 30 49 33" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 16 40 C 24 37 40 35 48 38" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
          {/* Toasted flaky edges */}
          <path d="M 50 24 L 48 44" stroke="#FEF3C7" strokeWidth="1.2" strokeOpacity="0.8" />
        </svg>
      );

    case 'miguelito':
      // Elongated soft bun sliced horizontally, stuffed with dulce de leche, sprinkled with white powdered sugar
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <linearGradient id="migDough" x1="12" y1="16" x2="52" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE68A" />
              <stop offset="0.5" stopColor="#F59E0B" />
              <stop offset="1" stopColor="#B45309" />
            </linearGradient>
            <linearGradient id="migDdl" x1="16" y1="30" x2="48" y2="34" gradientUnits="userSpaceOnUse">
              <stop stopColor="#B45309" />
              <stop offset="0.5" stopColor="#78350F" />
              <stop offset="1" stopColor="#451A03" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="52" rx="22" ry="4.5" fill="#000000" fillOpacity="0.12" />
          {/* Soft bun body */}
          <rect x="14" y="20" width="36" height="24" rx="12" fill="url(#migDough)" stroke="#78350F" strokeWidth="1.8" />
          {/* Sliced center smile brimming with Dulce de Leche */}
          <path
            d="M 15 32 Q 32 37 49 32 Q 32 30 15 32 Z"
            fill="url(#migDdl)"
            stroke="#451A03"
            strokeWidth="1.3"
          />
          {/* Generous powdered sugar dusting on top */}
          <circle cx="22" cy="24" r="0.9" fill="#FFFFFF" fillOpacity="0.95" />
          <circle cx="28" cy="23" r="1.1" fill="#FFFFFF" fillOpacity="0.95" />
          <circle cx="34" cy="24" r="1.2" fill="#FFFFFF" fillOpacity="0.95" />
          <circle cx="40" cy="23" r="1" fill="#FFFFFF" fillOpacity="0.95" />
          <circle cx="45" cy="25" r="0.8" fill="#FFFFFF" fillOpacity="0.95" />
          <circle cx="25" cy="26" r="0.8" fill="#FFFFFF" fillOpacity="0.95" />
          <circle cx="37" cy="26" r="0.9" fill="#FFFFFF" fillOpacity="0.95" />
        </svg>
      );

    case 'chipa':
    default:
      // Delicious warm cheese ball with toasted golden patches
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <defs>
            <radialGradient id="chipaGrad" cx="28" cy="26" r="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FEF08A" />
              <stop offset="0.4" stopColor="#FBBF24" />
              <stop offset="0.8" stopColor="#F97316" />
              <stop offset="1" stopColor="#C2410C" />
            </radialGradient>
          </defs>
          <ellipse cx="32" cy="52" rx="18" ry="4.5" fill="#000000" fillOpacity="0.14" />
          {/* Round cheese ball with slightly irregular artisan shape */}
          <path
            d="M 16 32 C 15 22 23 16 32 16 C 42 15 49 22 48 32 C 48 42 41 48 32 48 C 21 48 16 42 16 32 Z"
            fill="url(#chipaGrad)"
            stroke="#9A3412"
            strokeWidth="1.8"
          />
          {/* Toasted cheese spots (gratinado criollo) */}
          <ellipse cx="26" cy="24" rx="3.5" ry="2.5" fill="#7C2D12" fillOpacity="0.8" />
          <circle cx="38" cy="26" r="2.5" fill="#9A3412" fillOpacity="0.85" />
          <circle cx="30" cy="38" r="3" fill="#7C2D12" fillOpacity="0.8" />
          <circle cx="21" cy="34" r="2" fill="#9A3412" fillOpacity="0.7" />
          <circle cx="41" cy="36" r="2.2" fill="#7C2D12" fillOpacity="0.75" />
          <circle cx="32" cy="29" r="1.5" fill="#C2410C" />
          {/* Melted cheese gloss */}
          <path d="M 24 20 Q 30 18 36 20" stroke="#FFFBEB" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.8" />
        </svg>
      );
  }
}

export function FacturaAppIcon({
  facturaId,
  className = "w-10 h-10",
  size,
  showBadge = false,
  interactive = true,
  onFacturaChange,
}: FacturaIconProps) {
  const [currentFactura, setCurrentFactura] = useState<FacturaPastry>(() => {
    if (facturaId) {
      const found = FACTURAS_LIST.find((f) => f.id === facturaId);
      if (found) return found;
    }
    return getRandomFactura();
  });

  const [isWiggling, setIsWiggling] = useState(false);

  const handleNextFactura = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const currentIndex = FACTURAS_LIST.findIndex((f) => f.id === currentFactura.id);
    const nextIndex = (currentIndex + 1) % FACTURAS_LIST.length;
    const nextFactura = FACTURAS_LIST[nextIndex];
    setCurrentFactura(nextFactura);
    setIsWiggling(true);
    setTimeout(() => setIsWiggling(false), 400);
    if (onFacturaChange) {
      onFacturaChange(nextFactura);
    }
  };

  return (
    <div
      className={`relative inline-flex items-center group ${interactive ? 'cursor-pointer select-none' : ''}`}
      onClick={interactive ? (e) => handleNextFactura(e) : undefined}
      title={interactive ? `Factura: ${currentFactura.name} (clic para otra factura 🥐)` : currentFactura.name}
    >
      <div
        className={`rounded-2xl p-1.5 flex items-center justify-center transition-transform shadow-xs ${
          isWiggling ? 'scale-110 rotate-6' : 'hover:scale-105 active:scale-95'
        } ${className}`}
        style={{
          backgroundColor: currentFactura.badgeBg,
          borderColor: currentFactura.accentColor + '40',
          borderWidth: '1.5px',
        }}
      >
        <FacturaIllustration id={currentFactura.id} className="w-full h-full drop-shadow-xs" />
      </div>

      {showBadge && (
        <span
          className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold border transition-colors flex items-center space-x-1"
          style={{
            backgroundColor: currentFactura.badgeBg,
            color: currentFactura.accentColor,
            borderColor: currentFactura.accentColor + '50',
          }}
        >
          <span>{currentFactura.name}</span>
          {interactive && (
            <RefreshCw className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-300" />
          )}
        </span>
      )}
    </div>
  );
}
