import { redirect } from "next/navigation";

// La portada solo redirige: el proxy decide si va a /login o a /inventario.
export default function Home() {
  redirect("/inventario");
}
