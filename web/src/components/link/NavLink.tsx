'use client';
import NextLink, { LinkProps as NextLinkProps } from 'next/link';
import {
  CSSProperties,
  ComponentProps,
  PropsWithChildren,
  useMemo,
} from 'react';

export type NavLinkProps = NextLinkProps &
  PropsWithChildren & {
    styles?: CSSProperties;
    // strictNullChecks 下 style 可能是 undefined，必须先 NonNullable 再取字段，
    // 否则 KB 目录的严格类型闸门（tsconfig.strict.json）会在此处报 TS2339
    borderRadius?: NonNullable<
      ComponentProps<typeof NextLink>['style']
    >['borderRadius'];
  };

function NavLink({ className, children, styles, borderRadius, ...props }: any) {
  const memoizedStyles = useMemo(
    () => ({
      borderRadius: borderRadius || 0,
      ...styles,
    }),
    [borderRadius, styles],
  );

  return (
    <NextLink className={`${className}`} style={memoizedStyles} {...props}>
      {children}
    </NextLink>
  );
}

export default NavLink;
