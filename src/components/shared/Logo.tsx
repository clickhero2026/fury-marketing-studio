import React from 'react';
import { useTheme } from 'next-themes';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const { resolvedTheme } = useTheme();
  
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-10',
    lg: 'h-16'
  };

  const logoSrc = resolvedTheme === 'dark' ? '/logo-dark.png' : '/logo-light.png';

  return (
    <img 
      src={logoSrc} 
      alt="ClickHero Logo" 
      className={`${sizeClasses[size]} w-auto object-contain ${className}`}
    />
  );
};
