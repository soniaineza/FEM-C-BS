import { Text as RNText, TextProps as RNTextProps } from 'react-native';

import { Colors, Fonts, Type, TypeVariant } from '../../constants/theme';

export type TextTone = 'default' | 'muted' | 'subtle' | 'primary' | 'danger' | 'warning' | 'inverse';
export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

const toneColor: Record<TextTone, string> = {
  default: Colors.fg,
  muted: Colors['fg-muted'],
  subtle: Colors['fg-subtle'],
  primary: Colors['primary-text'],
  danger: Colors.danger,
  warning: Colors.warning,
  inverse: Colors['fg-inverse'],
};

// Display variants use Poppins; everything else uses Inter. Default weights
// follow the HIG: titles bold, headline semibold, body regular.
const defaultWeight: Record<TypeVariant, TextWeight | 'display'> = {
  'large-title': 'display',
  'title-1': 'display',
  'title-2': 'display',
  'title-3': 'semibold',
  headline: 'semibold',
  body: 'regular',
  callout: 'regular',
  subhead: 'regular',
  footnote: 'regular',
  caption: 'regular',
  micro: 'medium',
};

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  weight?: TextWeight;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

/** Typography primitive: pick a role from the type ramp instead of raw sizes. */
export function Text({ variant = 'body', tone = 'default', weight, align, style, ...rest }: TextProps) {
  const w = weight ?? defaultWeight[variant];
  const fontFamily = w === 'display' ? Fonts.display : Fonts[w];
  return (
    <RNText
      style={[Type[variant], { fontFamily, color: toneColor[tone], textAlign: align }, style]}
      {...rest}
    />
  );
}
