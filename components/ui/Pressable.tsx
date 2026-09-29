import { forwardRef, ReactNode, useState } from 'react';
import {
  GestureResponderEvent,
  Pressable as RNPressable,
  PressableProps as RNPressableProps,
  PressableStateCallbackType,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

type State = PressableStateCallbackType;

export interface PressableProps extends Omit<RNPressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle> | ((state: State) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: State) => ReactNode);
  className?: string;
}

/**
 * Drop-in Pressable whose `style` / `children` functions always work.
 *
 * NativeWind's interop wraps react-native's Pressable and, on native release
 * builds (and on web whenever a className is set), drops a function `style`
 * — buttons lost their background and height. This tracks the pressed state
 * itself and hands RN a plain style value.
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { style, children, onPressIn, onPressOut, ...rest },
  ref
) {
  const [pressed, setPressed] = useState(false);
  const state = { pressed, hovered: false } as State;
  return (
    <RNPressable
      ref={ref}
      onPressIn={(e: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={typeof style === 'function' ? style(state) : style}
      {...rest}
    >
      {typeof children === 'function' ? children(state) : children}
    </RNPressable>
  );
});
