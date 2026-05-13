import { useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Page not found</p>
        <a href="/normal/" className="text-primary underline hover:text-primary/90">
          Return to Dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;
