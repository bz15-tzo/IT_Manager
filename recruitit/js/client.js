// ============================================================
// OnboardIT - Initialisation du client Supabase
// ============================================================
// Crée le client avec l'URL et la clé anon de js/config.js.
// Si la configuration est manquante ou si le CDN est indisponible,
// une erreur lisible est affichée (pas de page blanche).
// ============================================================

// NOTE : on utilise `recruititClient` et PAS `supabase`, car le build UMD du CDN
// (https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2) déclare lui-même un
// global `var supabase`. Un `let supabase` ici provoquerait un SyntaxError
// ("Identifier 'supabase' has already been declared") et bloquerait toute l'app.
let recruititClient = null;
let supabaseInitError = "";

try {
  if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
    throw new Error(
      "La bibliothèque Supabase JS n'a pas pu être chargée depuis le CDN. " +
      "Vérifiez votre connexion Internet."
    );
  }

  if (
    !SUPABASE_URL ||
    !String(SUPABASE_URL).startsWith("https://") ||
    SUPABASE_URL.includes("VOTRE_") ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes("VOTRE_")
  ) {
    throw new Error(
      "Configuration Supabase manquante. Ouvrez le fichier js/config.js " +
      "et renseignez SUPABASE_URL et SUPABASE_ANON_KEY."
    );
  }

  recruititClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  supabaseInitError = e.message;
}
