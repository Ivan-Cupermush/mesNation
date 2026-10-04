import { css } from 'styled-components';

export const sizes = {
  desktop: 1280,
  laptop: 1024,
  tablet: 768,
  mobile: 480,
};

export const media = {
  desktop: (first: any, ...interp: any[]) => css`
    @media (max-width: ${sizes.desktop}px) { ${css(first, ...interp)} }
  `,
  laptop: (first: any, ...interp: any[]) => css`
    @media (max-width: ${sizes.laptop}px) { ${css(first, ...interp)} }
  `,
  tablet: (first: any, ...interp: any[]) => css`
    @media (max-width: ${sizes.tablet}px) { ${css(first, ...interp)} }
  `,
  mobile: (first: any, ...interp: any[]) => css`
    @media (max-width: ${sizes.mobile}px) { ${css(first, ...interp)} }
  `,
};
