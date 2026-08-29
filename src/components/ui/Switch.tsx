import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'onChange'> {
  label?: string;
  description?: string;
  onChange?: (checked: boolean) => void;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, description, id, checked, disabled, onChange, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || `switch-${autoId}`;

    return (
      <label
        htmlFor={inputId}
        className={cn(
          'flex items-center justify-between gap-4 cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {(label || description) && (
          <div className="min-w-0 flex-1">
            {label && <p className="text-sm font-medium text-gray-700">{label}</p>}
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="sr-only peer"
          onChange={(e) => onChange?.(e.target.checked)}
          {...props}
        />
        <div className={cn(
          'relative w-11 h-6 rounded-full transition-colors duration-200',
          'bg-gray-200 peer-checked:bg-primary-500',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/20 peer-focus-visible:ring-offset-2',
          'peer-disabled:opacity-50',
          'after:content-[""] after:absolute after:top-0.5 after:left-0.5',
          'after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform after:duration-200',
          'after:shadow-sm',
          'peer-checked:after:translate-x-5'
        )} />
      </label>
    );
  }
);

Switch.displayName = 'Switch';
export default Switch;
