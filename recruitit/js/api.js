// ============================================================
// OnboardIT - Couche API (Supabase)
// ============================================================
// Toutes les interactions avec Supabase : auth + données.
// Le client est initialisé dans js/client.js (variable globale `recruititClient`).
// ============================================================

const api = {
  // ---------- AUTH ----------

  async signUp(email, password, fullName, role) {
    const { data, error } = await recruititClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } }
    });
    if (error) throw error;
    // Le profil est créé par le trigger handle_new_user qui
    // lit le rôle depuis les métadonnées.
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await recruititClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await recruititClient.auth.signOut();
    if (error) throw error;
  },

  getSession() {
    return recruititClient.auth.getSession();
  },

  onAuthChange(callback) {
    return recruititClient.auth.onAuthStateChange((event, session) => callback(event, session));
  },

  async getProfile(userId) {
    const { data, error } = await recruititClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  },

  // ---------- ONBOARDINGS ----------

  async createOnboarding(payload) {
    const { data, error } = await recruititClient
      .from("onboardings")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateOnboarding(id, payload) {
    const { data, error } = await recruititClient
      .from("onboardings")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteOnboarding(id) {
    const { data, error } = await recruititClient
      .from("onboardings")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return data;
  },

  async listOnboardings() {
    const { data, error } = await recruititClient
      .from("onboardings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  // ---------- TASKS ----------

  async listTasks(onboardingId) {
    const { data, error } = await recruititClient
      .from("tasks")
      .select("*")
      .eq("onboarding_id", onboardingId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },

  async createTasks(taskList) {
    const { data, error } = await recruititClient
      .from("tasks")
      .insert(taskList)
      .select();
    if (error) throw error;
    return data;
  },

  async updateTask(id, payload) {
    const { data, error } = await recruititClient
      .from("tasks")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTask(id) {
    const { data, error } = await recruititClient
      .from("tasks")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return data;
  },

  // ---------- BLOCKERS (blocages / incidents) ----------

  async listBlockersForIds(ids) {
    if (!ids.length) return [];
    const { data, error } = await recruititClient
      .from("blockers")
      .select("*")
      .in("onboarding_id", ids)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  },

  async createBlocker(payload) {
    const { data, error } = await recruititClient
      .from("blockers")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async resolveBlocker(id, note) {
    const { data, error } = await recruititClient
      .from("blockers")
      .update({
        status: "resolved",
        resolved_note: note || "",
        resolved_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteBlocker(id) {
    const { data, error } = await recruititClient
      .from("blockers")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return data;
  },

  // ---------- DOCUMENTS (upload) ----------

  async listDocuments(onboardingId) {
    const { data, error } = await recruititClient
      .from("documents")
      .select("*")
      .eq("onboarding_id", onboardingId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async uploadDocument(file, onboardingId) {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${onboardingId}/${crypto.randomUUID()}.${ext}`;
    const { error: upError } = await recruititClient.storage
      .from("documents")
      .upload(path, file);
    if (upError) throw upError;

    const { data: urlData } = recruititClient.storage.from("documents").getPublicUrl(path);

    const { data, error } = await recruititClient
      .from("documents")
      .insert({
        onboarding_id: onboardingId,
        name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type || ext
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteDocument(doc) {
    // Extrait le chemin du fichier depuis l'URL publique
    const marker = "object/public/documents/";
    const idx = doc.file_url.indexOf(marker);
    if (idx !== -1) {
      const path = doc.file_url.slice(idx + marker.length);
      await recruititClient.storage.from("documents").remove([path]);
    }
    const { error } = await recruititClient
      .from("documents")
      .delete()
      .eq("id", doc.id);
    if (error) throw error;
  },

  // ---------- LISTES ADMINISTRABLES (départements, matériel) ----------

  async listListItems(category) {
    const { data, error } = await recruititClient
      .from("list_items")
      .select("*")
      .eq("category", category)
      .order("value", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createListItem(category, value) {
    const { data, error } = await recruititClient
      .from("list_items")
      .insert({ category, value })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteListItem(id) {
    const { data, error } = await recruititClient
      .from("list_items")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return data;
  },

  // ---------- REALTIME (mise à jour en direct) ----------

  subscribeOnboardings(onChange) {
    try {
      if (!recruititClient || typeof recruititClient.channel !== "function") return null;
      return recruititClient
        .channel("onboardings-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "onboardings" }, onChange)
        .subscribe();
    } catch (e) {
      console.warn("OnboardIT : realtime onboardings désactivé :", e.message);
      return null;
    }
  },

  subscribeTasks(onChange) {
    try {
      if (!recruititClient || typeof recruititClient.channel !== "function") return null;
      return recruititClient
        .channel("tasks-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
        .subscribe();
    } catch (e) {
      console.warn("OnboardIT : realtime tasks désactivé :", e.message);
      return null;
    }
  },

  subscribeBlockers(onChange) {
    try {
      if (!recruititClient || typeof recruititClient.channel !== "function") return null;
      return recruititClient
        .channel("blockers-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "blockers" }, onChange)
        .subscribe();
    } catch (e) {
      console.warn("OnboardIT : realtime blockers désactivé :", e.message);
      return null;
    }
  }
};
