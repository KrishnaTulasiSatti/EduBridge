import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="max-w-md text-center">
        <Logo className="justify-center" />
        <p className="mt-12 text-sm text-subtle">Error 404</p>
        <h1 className="mt-2 font-display text-[34px] font-medium">Page not found</h1>
        <p className="mt-3 text-muted-foreground">The page you are looking for does not exist or may have moved.</p>
        <Link to="/" className={cn(buttonVariants({ variant: 'secondary' }), 'mt-8')}>
          Return to the home page
        </Link>
      </div>
    </div>
  );
}
