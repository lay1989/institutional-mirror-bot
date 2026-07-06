/**
 * Types and interfaces for Institutional Mirror - SMC Trading Dashboard
 */

export interface Trade {
  id: string; // Unique ID (timestamp or uuid)
  dateTimeUtc: string; // ISO string or UTC format
  pair: string; // BTC/USDT | ETH/USDT | SOL/USDT | Other
  killZone: string; // Asian Range | London KZ | NY KZ | Silver Bullet | Outside / Other
  direction: 'Long' | 'Short';
  setupType: 'Type A' | 'Type B';
  confluenceScore: number; // 1-6
  amdBias: 'Bullish NY' | 'Bearish NY' | 'N/A';
  priceZone: 'Discount' | 'Premium' | 'Neutral';
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskPercent: number;
  positionSizeUsd: number;
  preTradeNotes: string;
  result: 'Win-TP3' | 'Partial-TP2' | 'Partial-TP1' | 'Loss' | 'Breakeven' | 'Closed-Time-Limit';
  rMultiple: number; // Positive/negative number
  whatWentRight: string;
  whatWentWrong: string;
  wouldTakeAgain: 'Yes' | 'No';
}

export interface DailyPrepState {
  dateUtc: string; // YYYY-MM-DD format
  checked: boolean[]; // array of 8 booleans
}

export interface CalculatorState {
  accountSize: number;
  riskPercent: number;
  direction: 'Long' | 'Short';
  entryPrice: number;
  stopLoss: number;
  leverage: number;
}

export interface ChecklistState {
  confluences: boolean[]; // array of 6 booleans
  setupType: 'Type A' | 'Type B';
  safetyChecked: boolean[]; // array of 5 booleans
}

export interface KillZone {
  name: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  description: string;
}

export const KILL_ZONES: KillZone[] = [
  { name: 'Asian Range', startHour: 0, startMin: 0, endHour: 4, endMin: 0, description: 'Accumulation and initial range boundary establishment.' },
  { name: 'London KZ', startHour: 7, startMin: 0, endHour: 10, endMin: 0, description: 'Manipulation phase. Often sweeps Asian highs/lows.' },
  { name: 'New York KZ', startHour: 12, startMin: 0, endHour: 15, endMin: 0, description: 'Distribution phase. Major trends or sweeps of London session.' },
  { name: 'Silver Bullet', startHour: 15, startMin: 0, endHour: 16, endMin: 0, description: 'High probability late-day algorithm liquidity delivery window.' },
];
