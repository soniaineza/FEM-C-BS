type Shadow = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

declare const tokens: {
  green: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;
  neutral: Record<0 | 25 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;
  palette: {
    canvas: string;
    surface: string;
    'surface-muted': string;
    'surface-inverse': string;
    overlay: string;
    fg: string;
    'fg-muted': string;
    'fg-subtle': string;
    'fg-disabled': string;
    'fg-inverse': string;
    border: string;
    'border-strong': string;
    divider: string;
    primary: string;
    'primary-hover': string;
    'primary-pressed': string;
    'primary-soft': string;
    'primary-tint': string;
    'primary-fg': string;
    'primary-text': string;
    success: string;
    'success-soft': string;
    danger: string;
    'danger-soft': string;
    'danger-border': string;
    warning: string;
    'warning-fill': string;
    'warning-soft': string;
    info: string;
    'info-soft': string;
    star: string;
  };
  typeScale: Record<
    'large-title' | 'title-1' | 'title-2' | 'title-3' | 'headline' | 'body' | 'callout' | 'subhead' | 'footnote' | 'caption' | 'micro',
    [number, number]
  >;
  fonts: Record<'regular' | 'medium' | 'semibold' | 'bold' | 'display', string>;
  radius: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'pill', number>;
  elevation: Record<0 | 1 | 2 | 3 | 4, Shadow>;
  motion: Record<'pressScale' | 'pressOpacity' | 'fast' | 'base' | 'slow', number>;
};

export = tokens;
