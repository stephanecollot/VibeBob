import type { ComponentType, SVGProps } from "react";

type HeroIcon = ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;

interface IconButtonProps {
  icon: HeroIcon;
  onClick?: () => void;
  title?: string;
  variant?: "default" | "danger" | "warning";
  size?: "sm" | "md";
  className?: string;
}

const VARIANTS: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  default: "text-gray-400 hover:bg-gray-100 hover:text-gray-700",
  danger: "text-gray-400 hover:bg-red-50 hover:text-red-600",
  warning: "text-gray-400 hover:bg-amber-50 hover:text-amber-600",
};

const SIZES: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

const ICON_SIZES: Record<NonNullable<IconButtonProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
};

export function IconButton({
  icon: Icon,
  onClick,
  title,
  variant = "default",
  size = "md",
  className = "",
}: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      <Icon className={ICON_SIZES[size]} aria-hidden="true" />
    </button>
  );
}
