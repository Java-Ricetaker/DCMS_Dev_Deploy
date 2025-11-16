import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function PaymentRedirect({ to = "/patient" }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);

  return null;
}


