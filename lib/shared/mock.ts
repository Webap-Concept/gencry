// Mock data condivisi per la fase visiva (CP3-CP6).
// Saranno sostituiti da query DB / API esterne nelle fasi successive.

import type { Coin, User } from "./types";

export const COINS: Coin[] = [
  { sym: "BTC", name: "Bitcoin", cat: "Layer 1", price: 71285, change: 2.4 },
  { sym: "ETH", name: "Ethereum", cat: "Layer 1", price: 3842, change: 1.8 },
  { sym: "SOL", name: "Solana", cat: "Layer 1", price: 178.32, change: 5.2 },
  { sym: "PEPE", name: "Pepe", cat: "Memecoin", price: 0.00001284, change: 12.4 },
  { sym: "WIF", name: "dogwifhat", cat: "Memecoin", price: 2.84, change: -3.1 },
  { sym: "PEN", name: "Pendle", cat: "DeFi", price: 6.42, change: 7.2 },
  { sym: "AVAX", name: "Avalanche", cat: "Layer 1", price: 38.51, change: 0.6 },
  { sym: "LINK", name: "Chainlink", cat: "Oracle", price: 18.92, change: -1.4 },
  { sym: "UNI", name: "Uniswap", cat: "DeFi", price: 11.74, change: 3.3 },
  { sym: "ARB", name: "Arbitrum", cat: "Layer 2", price: 1.32, change: -0.8 },
  { sym: "OP", name: "Optimism", cat: "Layer 2", price: 2.18, change: 4.1 },
  { sym: "AAVE", name: "Aave", cat: "DeFi", price: 142.6, change: 1.2 },
  { sym: "DOGE", name: "Dogecoin", cat: "Memecoin", price: 0.1583, change: -2.5 },
  { sym: "BONK", name: "Bonk", cat: "Memecoin", price: 0.00002314, change: 8.7 },
];

export const USERS: User[] = [
  {
    handle: "lunavega",
    name: "Luna Vega",
    avatar: "LV",
    color: "#7e8aff",
    followers: 1240,
    bio: "DeFi research · long-term ETH",
  },
  {
    handle: "matteo.eth",
    name: "Matteo Russo",
    avatar: "MR",
    color: "#3a8c5e",
    followers: 3120,
    bio: "On-chain analyst, BTC maxi soft",
  },
  {
    handle: "sarah_btc",
    name: "Sarah Chen",
    avatar: "SC",
    color: "#c2553f",
    followers: 5890,
    bio: "Tradeo solo Bitcoin, niente shitcoin.",
  },
  {
    handle: "degenale",
    name: "Alessandro De Luca",
    avatar: "AD",
    color: "#fa8b1e",
    followers: 8420,
    bio: "Memecoins & vibes. Non è financial advice.",
  },
  {
    handle: "tu",
    name: "Tu",
    avatar: "TU",
    color: "#5c5146",
    followers: 0,
    bio: "Il tuo profilo.",
  },
];
