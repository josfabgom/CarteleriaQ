import fs from 'fs';
import csv from 'csv-parser';

export type CsvRow = Record<string, string>;

// "Código Interno", "codigo-interno" y "CODIGO_INTERNO" -> "codigo_interno"
export const normalizeHeader = (header: string): string =>
  header
    .replace(/^﻿/, '') // BOM de Excel ("CSV UTF-8")
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Excel en español guarda con ";" (y a veces tabulador); Google Sheets y otros, con ",".
// Se elige el separador que más aparece en el encabezado, fuera de comillas.
export const detectSeparator = (headerLine: string): string => {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
};

// Lee un CSV tolerante: BOM, separador , ; o tab, encabezados con mayúsculas/tildes/espacios
export async function parseCsvFile(filePath: string): Promise<CsvRow[]> {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = detectSeparator(firstLine);

  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    const stream = csv({ separator, mapHeaders: ({ header }) => normalizeHeader(header) });
    stream.on('data', (row: CsvRow) => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
    stream.write(text);
    stream.end();
  });
}

// Primer valor no vacío entre los alias posibles de una columna
export const pick = (row: CsvRow, ...aliases: string[]): string => {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return '';
};

// Convierte "9500", "9500.50", "9.500", "9.500,50", "$ 9.500", "1,400" -> número. NaN si no es un precio.
export function parsePrice(raw: string): number {
  let s = raw.replace(/[^\d.,-]/g, ''); // quita $, espacios, letras
  if (!s || !/\d/.test(s)) return NaN;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    // Ambos: el que aparece último es el decimal, el otro es separador de miles
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    // Solo coma: "1,400" (miles) vs "9500,50" (decimal)
    const left = s.split(',')[0];
    s = /,\d{3}$/.test(s) && s.split(',').length === 2 && left.length <= 3 && left !== '0' ? s.replace(',', '') : s.replace(',', '.');
  } else if (lastDot !== -1) {
    // Solo punto: "9.500" (miles) vs "9500.50" (decimal)
    s = /\.\d{3}$/.test(s) && s.split('.')[0] !== '0' ? s.split('.').join('') : s;
  }

  const value = Number(s);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}
