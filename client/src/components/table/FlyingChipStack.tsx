import React, { useEffect, useMemo, useState } from 'react';
import { FlyingChip } from '../../store/useGameStore';

interface FlyingChipStackProps {
  chip: FlyingChip;
  startXPercent: number;
  startYPercent: number;
  endXPercent?: number;
  endYPercent?: number;
}

interface ChipColorPalette {
  faceTop: string;
  faceBottom: string;
  rimDark: string;
  stripe: string;
  ring: string;
  glow: string;
}

const CHIP_PALETTES: Record<string, ChipColorPalette> = {
  emerald: {
    faceTop: '#10b981',
    faceBottom: '#047857',
    rimDark: '#064e3b',
    stripe: '#ecfdf5',
    ring: 'rgba(167, 243, 208, 0.75)',
    glow: 'rgba(16, 185, 129, 0.45)',
  },
  sapphire: {
    faceTop: '#3b82f6',
    faceBottom: '#1d4ed8',
    rimDark: '#1e3a8a',
    stripe: '#eff6ff',
    ring: 'rgba(191, 219, 254, 0.8)',
    glow: 'rgba(59, 130, 246, 0.45)',
  },
  crimson: {
    faceTop: '#ef4444',
    faceBottom: '#b91c1c',
    rimDark: '#7f1d1d',
    stripe: '#fef2f2',
    ring: 'rgba(254, 202, 202, 0.85)',
    glow: 'rgba(239, 68, 68, 0.5)',
  },
  amethyst: {
    faceTop: '#a855f7',
    faceBottom: '#7e22ce',
    rimDark: '#581c87',
    stripe: '#faf5ff',
    ring: 'rgba(233, 213, 255, 0.85)',
    glow: 'rgba(168, 85, 247, 0.55)',
  },
  obsidian: {
    faceTop: '#3f3f46',
    faceBottom: '#18181b',
    rimDark: '#09090b',
    stripe: '#facc15',
    ring: 'rgba(250, 204, 21, 0.85)',
    glow: 'rgba(234, 179, 8, 0.55)',
  },
  gold: {
    faceTop: '#fde047',
    faceBottom: '#ca8a04',
    rimDark: '#854d0e',
    stripe: '#fffbeb',
    ring: 'rgba(254, 249, 195, 0.95)',
    glow: 'rgba(250, 204, 21, 0.8)',
  },
};

/**
 * 根据下注/加注金额与类型，计算这一落筹码的层数（加注越多，筹码摞得越高）
 */
export function getChipStackCount(amount: number, actionType?: 'call' | 'raise' | 'allin'): number {
  if (actionType === 'allin') return 32;
  if (amount <= 10) return 4;
  if (amount <= 20) return 7;
  if (amount <= 40) return 9;
  if (amount <= 50) return 11;
  if (amount <= 100) return 14;
  if (amount <= 200) return 17;
  if (amount <= 500) return 21;
  if (amount <= 1000) return 25;
  if (amount <= 2000) return 28;
  return 32;
}

/**
 * 为第 idx 层筹码挑选赌场色系，按每 4~5 枚分段叠色，越往上档次越高
 */
function getChipLayerPalette(idx: number, totalCount: number, actionType?: 'call' | 'raise' | 'allin'): ChipColorPalette {
  if (actionType === 'allin' && idx >= totalCount - 6) {
    return CHIP_PALETTES.gold;
  }
  const tierOrder = ['emerald', 'sapphire', 'crimson', 'amethyst', 'obsidian', 'gold'];
  // 让高额加注的筹码堆从更高价值的色系开始组合，并形成分层条带感
  const startTier = totalCount >= 24 ? 2 : totalCount >= 14 ? 1 : 0;
  const bandIndex = Math.min(tierOrder.length - 1, startTier + Math.floor(idx / 5));
  return CHIP_PALETTES[tierOrder[bandIndex]];
}

export const FlyingChipStack: React.FC<FlyingChipStackProps> = ({
  chip,
  startXPercent,
  startYPercent,
  endXPercent = 50,
  endYPercent = 50,
}) => {
  // 动画阶段：spawn (在玩家手牌前叠起) -> moving (推向该玩家前方下注区) -> settled (稳稳留在桌面上)
  const [phase, setPhase] = useState<'spawn' | 'moving' | 'settled'>('spawn');
  const [showImpactRing, setShowImpactRing] = useState(false);

  const effectiveAmount = chip.actualAmount ?? chip.chipValue;
  const chipCount = useMemo(
    () => getChipStackCount(effectiveAmount, chip.actionType),
    [effectiveAmount, chip.actionType]
  );

  // 为每枚筹码生成轻微且固定的水平错位，营造真实手工摞筹码的立体层次感
  const layers = useMemo(() => {
    const seed = chip.id.charCodeAt(0) || 1;
    return Array.from({ length: chipCount }, (_, idx) => {
      const isBottomOrTop = idx === 0 || idx === chipCount - 1;
      const jitterX = isBottomOrTop
        ? 0
        : Math.round(Math.sin(idx * 2.1 + seed) * 1.5 * 10) / 10;
      const palette = getChipLayerPalette(idx, chipCount, chip.actionType);
      return {
        idx,
        jitterX,
        palette,
      };
    });
  }, [chipCount, chip.id, chip.actionType]);

  // 落入玩家专属阵地时带极微小的自然手工摆放偏移
  const targetCoords = useMemo(() => {
    const codeA = chip.id.charCodeAt(0) || 7;
    const codeB = chip.id.charCodeAt(1) || 13;
    const offsetX = ((codeA % 5) - 2) * 0.22;
    const offsetY = ((codeB % 5) - 2) * 0.18;
    return {
      x: endXPercent + offsetX,
      y: endYPercent + offsetY,
    };
  }, [chip.id, endXPercent, endYPercent]);

  useEffect(() => {
    // 阶段1：先在玩家手牌前快速叠起一落筹码并短暂展示高度 (260ms)
    const moveTimer = setTimeout(() => {
      setPhase('moving');
    }, 260);

    // 阶段2：平滑推向玩家面前阵地后落定保留在桌面上 (260ms + 660ms = 920ms)
    const settleTimer = setTimeout(() => {
      setPhase('settled');
      setShowImpactRing(true);
    }, 920);

    // 落定光圈短暂闪烁后收敛，筹码柱继续留在桌面
    const ringTimer = setTimeout(() => {
      setShowImpactRing(false);
    }, 1350);

    return () => {
      clearTimeout(moveTimer);
      clearTimeout(settleTimer);
      clearTimeout(ringTimer);
    };
  }, []);

  const currentX = phase === 'spawn' ? startXPercent : targetCoords.x;
  const currentY = phase === 'spawn' ? startYPercent : targetCoords.y;

  // 每层筹码垂直向上堆叠的像素步长
  const stepY = 3.2;
  const stackHeightPx = (chipCount - 1) * stepY + 20;
  const topPalette = layers[layers.length - 1]?.palette || CHIP_PALETTES.gold;

  // 根据 Y 轴位置计算 2.5D 景深层级（越靠屏幕下方的筹码堆层级越高，符合真实俯视遮挡关系）
  const depthZIndex = Math.min(29, Math.max(12, Math.round(currentY / 4) + 10));

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${currentX}%`,
        top: `${currentY}%`,
        zIndex: depthZIndex,
        transform: 'translate(-50%, -50%) scale(1)',
        opacity: 1,
        transition:
          'left 660ms cubic-bezier(0.22, 1, 0.36, 1), top 660ms cubic-bezier(0.22, 1, 0.36, 1), transform 260ms ease-out',
      }}
    >
      {/* 筹码堆容器（以底座中心为锚点，向上生长） */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '40px',
          height: '20px',
        }}
      >
        {/* 桌面毛呢接触面立体投影与高额加注光晕 */}
        <div
          className="absolute inset-x-0.5 bottom-0 h-5 rounded-full transition-all duration-500"
          style={{
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0.82) 28%, ${topPalette.glow} 68%, transparent 100%)`,
            transform: `scale(${chipCount >= 20 ? 1.25 : 1.05}) translateY(3px)`,
            filter: 'blur(2px)',
          }}
        />

        {/* 筹码推入阵地落定瞬间的金色波纹 */}
        {showImpactRing && (
          <div
            className="absolute inset-0 rounded-full border-2 border-amber-300/80 animate-ping"
            style={{
              boxShadow: '0 0 16px rgba(251, 191, 36, 0.7)',
            }}
          />
        )}

        {/* 逐层堆叠的 2.5D 仿真筹码柱 */}
        {layers.map(({ idx, jitterX, palette }) => {
          const isTopChip = idx === chipCount - 1;
          const dropDelayMs = Math.min(idx * 9, 210);

          return (
            <div
              key={idx}
              className="absolute left-1/2 chip-layer-drop"
              style={{
                width: '38px',
                height: '20px',
                bottom: `${idx * stepY}px`,
                marginLeft: `${-19 + jitterX}px`,
                zIndex: idx + 1,
                animationDelay: `${dropDelayMs}ms`,
              }}
            >
              {/* 1. 筹码圆柱侧壁厚度（带赌场经典白/金边齿条纹与层间暗缝） */}
              <div
                className="absolute inset-x-0 bottom-0 h-[18px] rounded-[50%]"
                style={{
                  background: `repeating-linear-gradient(
                    90deg,
                    ${palette.rimDark} 0px,
                    ${palette.rimDark} 5px,
                    ${palette.stripe} 5px,
                    ${palette.stripe} 8px,
                    ${palette.rimDark} 8px,
                    ${palette.rimDark} 13px
                  )`,
                  boxShadow: '0 1.5px 0 rgba(0, 0, 0, 0.88), 0 2px 3px rgba(0, 0, 0, 0.45)',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.75)',
                }}
              />

              {/* 2. 筹码椭圆上表面（每层露出边缘，最顶层完整呈现精美纹理） */}
              <div
                className="absolute inset-x-0 top-0 h-[15px] rounded-[50%] flex items-center justify-center overflow-hidden"
                style={{
                  background: `radial-gradient(ellipse at 35% 30%, ${palette.faceTop} 0%, ${palette.faceBottom} 85%)`,
                  border: `1.5px dashed ${palette.stripe}`,
                  boxShadow: isTopChip
                    ? 'inset 0 1px 2px rgba(255, 255, 255, 0.55), 0 1px 1px rgba(0, 0, 0, 0.5)'
                    : 'inset 0 0.5px 1px rgba(255, 255, 255, 0.3)',
                }}
              >
                {/* 顶层筹码专属内圈压花环与高光星芒 */}
                {isTopChip && (
                  <div
                    className="w-[24px] h-[9px] rounded-[50%] flex items-center justify-center"
                    style={{
                      border: `1px solid ${palette.ring}`,
                      background:
                        'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(0,0,0,0.18) 100%)',
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rotate-45"
                      style={{
                        backgroundColor: palette.stripe,
                        opacity: 0.9,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 高额加注（>=15层）顶部微光流萤点缀 */}
        {chipCount >= 15 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 w-10 h-6 rounded-full pointer-events-none"
            style={{
              bottom: `${stackHeightPx - 14}px`,
              background: `radial-gradient(ellipse at center, ${topPalette.glow} 0%, transparent 70%)`,
              filter: 'blur(3px)',
              zIndex: chipCount + 2,
            }}
          />
        )}
      </div>
    </div>
  );
};
