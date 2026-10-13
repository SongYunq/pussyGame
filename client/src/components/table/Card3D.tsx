import React from 'react';
import { Card } from '../../types/game';

interface Card3DProps {
  card: Card | null;
  isRevealed: boolean;
  fanIndex: number; // 0, 1, 2 分别对应左中右扇形倾角
  size?: 'sm' | 'md' | 'lg';
  isFolded?: boolean;
}

const SUIT_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  spades: { symbol: '♠', color: 'text-slate-900' },
  hearts: { symbol: '♥', color: 'text-red-600' },
  clubs: { symbol: '♣', color: 'text-slate-900' },
  diamonds: { symbol: '♦', color: 'text-red-600' },
};

const RANK_LABELS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const Card3D: React.FC<Card3DProps> = ({
  card,
  isRevealed,
  fanIndex,
  size = 'md',
  isFolded = false,
}) => {
  // 扇形微位移与倾斜角度
  const fanRotations = [-10, 0, 10];
  const fanTranslates = [-14, 0, 14];
  const rotZ = fanRotations[fanIndex] ?? 0;
  const transX = fanTranslates[fanIndex] ?? 0;

  // 尺寸映射
  const sizeClasses = {
    sm: 'w-8 h-12 text-[10px]',
    md: 'w-12 h-16 text-xs',
    lg: 'w-16 h-22 text-sm',
  }[size];

  const suitInfo = card ? SUIT_SYMBOLS[card.suit] || { symbol: '♠', color: 'text-slate-900' } : null;
  const rankLabel = card ? RANK_LABELS[card.rank] || String(card.rank) : '?';

  return (
    <div
      className={`relative inline-block transition-transform duration-500 ease-out select-none ${
        isFolded ? 'opacity-40 grayscale -translate-y-2' : ''
      }`}
      style={{
        transform: `translateX(${transX}px) rotateZ(${rotZ}deg)`,
        perspective: '1000px',
      }}
    >
      <div
        className={`relative ${sizeClasses} rounded-lg shadow-xl cursor-pointer transition-transform duration-700 ease-in-out`}
        style={{
          transformStyle: 'preserve-3d',
          transform: isRevealed && card ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* 卡牌背面 (未看牌 / 他人手牌) */}
        <div
          className="absolute inset-0 w-full h-full rounded-lg bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 border-2 border-amber-400/40 p-1 flex items-center justify-center backface-hidden shadow-md"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="w-full h-full rounded border border-dashed border-amber-300/30 flex items-center justify-center bg-blue-950/60">
            <span className="text-amber-400/70 font-black text-sm tracking-tighter">♠</span>
          </div>
        </div>

        {/* 卡牌正面 (翻开后) */}
        <div
          className="absolute inset-0 w-full h-full rounded-lg bg-slate-50 border-2 border-slate-300 p-1 flex flex-col justify-between shadow-lg"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {card && suitInfo && (
            <>
              {/* 左上角点数与花色 */}
              <div className={`flex flex-col items-center leading-none ${suitInfo.color} font-bold`}>
                <span className="font-extrabold">{rankLabel}</span>
                <span className="text-[10px] scale-90">{suitInfo.symbol}</span>
              </div>

              {/* 中央大花色水印 */}
              <div className={`absolute inset-0 flex items-center justify-center ${suitInfo.color} opacity-85 pointer-events-none`}>
                <span className="text-2xl font-black">{suitInfo.symbol}</span>
              </div>

              {/* 右下角倒置点数与花色 */}
              <div className={`flex flex-col items-center leading-none ${suitInfo.color} font-bold rotate-180 self-end`}>
                <span className="font-extrabold">{rankLabel}</span>
                <span className="text-[10px] scale-90">{suitInfo.symbol}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
