export default {
  async fetch(request, env, ctx) {
    const CloudKV = env.CloudKV;
    const CloudR2 = env.cloudr2;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age":       "86400",
        },
      });
    }

    const reqURL = new URL(request.url);
    const { pathname, searchParams } = reqURL;
    const target = searchParams.get("target");
    const nombre = searchParams.get("nombre");
    const proxyBase = reqURL.origin;

    const sinTarget = ["/claude", "/kv-save", "/kv-load", "/kv-delete", "/iaroll-save", "/iaroll-load", "/ai-proxy", "/tts-proxy", "/gtts", "/gtts-init", "/github-proxy", "/batch-download", "/r2-list", "/r2-upload", "/r2-delete", "/r2-download", "/r2-multipart-create", "/r2-multipart-part", "/r2-multipart-complete"];
    
    if (!sinTarget.includes(pathname) && (!target || !/^https?:\/\//.test(target))) {
      return new Response("URL inválida o falta ?target=", { status: 400 });
    }

    // ── /r2-list — listar objetos del bucket ──
    if (pathname === "/r2-list") {
      try {
        const prefix = searchParams.get("prefix") || "";
        const listed = await CloudR2.list({ prefix });
        const objetos = listed.objects.map(o => ({
          key:      o.key,
          size:     o.size,
          uploaded: o.uploaded,
        }));
        return new Response(JSON.stringify({ ok: true, objetos }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /r2-upload — subir un archivo al bucket ──
    if (pathname === "/r2-upload") {
      try {
        const key = decodeURIComponent(request.headers.get("X-R2-Key") || searchParams.get("key") || "");
        if (!key) return new Response(JSON.stringify({ ok: false, error: "Falta key" }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
        const buffer = await request.arrayBuffer();
        await CloudR2.put(key, buffer, {
          httpMetadata: { contentType: "application/octet-stream" }
        });
        return new Response(JSON.stringify({ ok: true, key, size: buffer.byteLength }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /r2-multipart-create — iniciar subida multipart ──
    if (pathname === "/r2-multipart-create") {
      try {
        const key = decodeURIComponent(request.headers.get("X-R2-Key") || "");
        if (!key) return new Response(JSON.stringify({ ok: false, error: "Falta key" }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
        const mpu = await CloudR2.createMultipartUpload(key, {
          httpMetadata: { contentType: "application/octet-stream" }
        });
        return new Response(JSON.stringify({ ok: true, uploadId: mpu.uploadId, key: mpu.key }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /r2-multipart-part — subir una parte ──
    if (pathname === "/r2-multipart-part") {
      try {
        const key      = decodeURIComponent(request.headers.get("X-R2-Key") || "");
        const uploadId = request.headers.get("X-Upload-Id") || "";
        const partNum  = parseInt(request.headers.get("X-Part-Number") || "1", 10);
        if (!key || !uploadId) return new Response(JSON.stringify({ ok: false, error: "Faltan headers" }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
        const mpu  = CloudR2.resumeMultipartUpload(key, uploadId);
        const body = await request.arrayBuffer();
        const part = await mpu.uploadPart(partNum, body);
        return new Response(JSON.stringify({ ok: true, etag: part.etag, partNumber: part.partNumber }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /r2-multipart-complete — completar subida multipart ──
    if (pathname === "/r2-multipart-complete") {
      try {
        const body     = await request.json();
        const { key, uploadId, parts } = body;
        if (!key || !uploadId || !parts) return new Response(JSON.stringify({ ok: false, error: "Faltan campos" }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
        const mpu = CloudR2.resumeMultipartUpload(key, uploadId);
        await mpu.complete(parts);
        return new Response(JSON.stringify({ ok: true, key }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /r2-delete — eliminar un objeto del bucket ──
    if (pathname === "/r2-delete") {
      try {
        const key = searchParams.get("key");
        if (!key) return new Response(JSON.stringify({ ok: false, error: "Falta ?key=" }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
        await CloudR2.delete(key);
        return new Response(JSON.stringify({ ok: true, key }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /r2-download — descargar un objeto del bucket (stream, sin límite de RAM) ──
    if (pathname === "/r2-download") {
      try {
        const key = searchParams.get("key");
        if (!key) return new Response(JSON.stringify({ ok: false, error: "Falta ?key=" }), {
          status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
        const objeto = await CloudR2.get(key);
        if (!objeto) return new Response(JSON.stringify({ ok: false, error: "Archivo no encontrado" }), {
          status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
        const nombreArchivo = key.split("/").pop();
        const headers = {
          "Content-Type":                "application/octet-stream",
          "Content-Disposition":         `attachment; filename="${nombreArchivo}"`,
          "Access-Control-Allow-Origin": "*",
        };
        if (objeto.size) headers["Content-Length"] = String(objeto.size);
        // objeto.body es un ReadableStream — nunca toca arrayBuffer(), sin límite de RAM
        return new Response(objeto.body, { headers });
      } catch(err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /kv-save — guardar historial ──
    if (pathname === "/kv-save") {
      try {
        const body = await request.json();
        const { id, data } = body;
        if (!id || !data) return new Response("Faltan campos", { status: 400,
                                                                headers: { "Access-Control-Allow-Origin": "*" } });
        await CloudKV.put(`historial_${id}`, JSON.stringify(data)); // 30 días
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /kv-load — cargar historial ──
    if (pathname === "/kv-load") {
      try {
        const id = searchParams.get("id");
        if (!id) return new Response("Falta ?id=", { status: 400,
                                                    headers: { "Access-Control-Allow-Origin": "*" } });
        const valor = await CloudKV.get(`historial_${id}`);
        return new Response(valor || "null", {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /kv-delete — limpiar historial ──
    if (pathname === "/kv-delete") {
      try {
        const id = searchParams.get("id");
        if (!id) return new Response("Falta ?id=", { status: 400,
                                                    headers: { "Access-Control-Allow-Origin": "*" } });
        await CloudKV.delete(`historial_${id}`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch(err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }
    
    // ── GitHub: endpoint único, acción según el campo "accion" ──
    if (pathname === "/github-proxy") {
      try {
        const body = await request.json();
        const { configId, accion, repo, path, contenido, mensaje } = body;
        if (!configId || !accion) return new Response("Faltan configId o accion", { status: 400,
                                              headers: { "Access-Control-Allow-Origin": "*" } });

        const cfgRaw = await CloudKV.get(`historial_${configId}`);
        if (!cfgRaw) return new Response("Config no encontrada", { status: 404,
                                              headers: { "Access-Control-Allow-Origin": "*" } });
        const cfg = JSON.parse(cfgRaw);
        if (!cfg.github) return new Response("Sin token de GitHub configurado", { status: 401,
                                              headers: { "Access-Control-Allow-Origin": "*" } });

        const ghHeaders = {
          "Authorization": `Bearer ${cfg.github}`,
          "Accept":        "application/vnd.github+json",
          "User-Agent":    "EditorVisorIDE"
        };

        // ── Listar todos los repos ──
        if (accion === "listarRepos") {
          const resp = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", { headers: ghHeaders });
          const data = await resp.json();
          if (!resp.ok) return new Response(JSON.stringify({ error: data.message }), {
            status: resp.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

          const repos = data.map(r => ({
            name: r.name, full_name: r.full_name, description: r.description,
            updated_at: r.updated_at, private: r.private
          }));
          return new Response(JSON.stringify({ repos }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        // ── Árbol de archivos de un repo (rama main) ──
        if (accion === "arbol") {
          if (!repo) return new Response("Falta repo", { status: 400,
            headers: { "Access-Control-Allow-Origin": "*" } });
          const resp = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, { headers: ghHeaders });
          const data = await resp.json();
          if (!resp.ok) return new Response(JSON.stringify({ error: data.message }), {
            status: resp.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

          const archivos = (data.tree || [])
            .filter(item => item.type === "blob")
            .map(item => ({ path: item.path, size: item.size }));
          return new Response(JSON.stringify({ archivos }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        // ── Contenido de un archivo específico ──
        if (accion === "leerArchivo") {
          if (!repo || !path) return new Response("Faltan repo o path", { status: 400,
            headers: { "Access-Control-Allow-Origin": "*" } });
          const resp = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=main`, { headers: ghHeaders });
          const data = await resp.json();
          if (!resp.ok) return new Response(JSON.stringify({ error: data.message }), {
            status: resp.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

          // GitHub devuelve el contenido en base64 — decodificar respetando UTF-8 (emojis, acentos, etc.)
          const base64Limpio = data.content.replace(/\n/g, '');
          const bytesArchivo = Uint8Array.from(atob(base64Limpio), c => c.charCodeAt(0));
          const contenidoDecodificado = new TextDecoder('utf-8').decode(bytesArchivo);
          return new Response(JSON.stringify({ contenido: contenidoDecodificado, sha: data.sha }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        // ── Subir/actualizar un archivo (commit directo a main) ──
        if (accion === "subirArchivo") {
          if (!repo || !path || contenido === undefined) return new Response("Faltan repo, path o contenido", { status: 400,
            headers: { "Access-Control-Allow-Origin": "*" } });

          // Necesitamos el sha actual del archivo para poder sobreescribirlo
          let shaActual = null;
          try {
            const respGet = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=main`, { headers: ghHeaders });
            if (respGet.ok) {
              const dataGet = await respGet.json();
              shaActual = dataGet.sha;
            }
          } catch(e) { /* archivo nuevo, no existe sha previo */ }

          const contenidoBase64 = btoa(unescape(encodeURIComponent(contenido)));
          const bodyCommit = {
            message: mensaje || "Actualización desde EditorVisorIDE",
            content: contenidoBase64,
            branch:  "main"
          };
          if (shaActual) bodyCommit.sha = shaActual;

          const resp = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: "PUT",
            headers: { ...ghHeaders, "Content-Type": "application/json" },
            body: JSON.stringify(bodyCommit)
          });
          const data = await resp.json();
          if (!resp.ok) return new Response(JSON.stringify({ error: data.message }), {
            status: resp.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

          return new Response(JSON.stringify({ ok: true, commit: data.commit?.sha }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        // ── Backup completo — todos los archivos de todos los repos, en streaming ──
        if (accion === "backup") {
          const EXTENSIONES_BINARIAS = ['.jpg', '.jpeg'];
          function esBinario(p) {
            const lower = p.toLowerCase();
            return EXTENSIONES_BINARIAS.some(ext => lower.endsWith(ext));
          }

          const encoder = new TextEncoder();
          let resolverListo;
          const streamListo = new Promise(res => { resolverListo = res; });

          const stream = new ReadableStream({
            async start(controller) {
              function enviar(obj) {
                controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
              }
              try {
                const respRepos = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", { headers: ghHeaders });
                const repos = await respRepos.json();
                if (!respRepos.ok) {
                  enviar({ tipo: "error", mensaje: repos.message || "Error listando repos" });
                  controller.close();
                  resolverListo();
                  return;
                }

                for (const repo of repos) {
                  let archivos = [];
                  try {
                    const respArbol = await fetch(
                      `https://api.github.com/repos/${repo.full_name}/git/trees/main?recursive=1`,
                      { headers: ghHeaders }
                    );
                    const dataArbol = await respArbol.json();
                    if (respArbol.ok) archivos = (dataArbol.tree || []).filter(item => item.type === "blob");
                  } catch(e) {}

                  for (const archivo of archivos) {
                    try {
                      const respFile = await fetch(
                        `https://api.github.com/repos/${repo.full_name}/contents/${archivo.path}?ref=main`,
                        { headers: ghHeaders }
                      );
                      const dataFile = await respFile.json();
                      if (!respFile.ok || !dataFile.content) continue;

                      const base64Limpio = dataFile.content.replace(/\n/g, '');
                      const binario = esBinario(archivo.path);

                      if (binario) {
                        enviar({ tipo: "archivo", repo: repo.full_name, path: archivo.path, binario: true, contenido: base64Limpio });
                      } else {
                        const bytes = Uint8Array.from(atob(base64Limpio), c => c.charCodeAt(0));
                        const texto = new TextDecoder('utf-8').decode(bytes);
                        enviar({ tipo: "archivo", repo: repo.full_name, path: archivo.path, binario: false, contenido: texto });
                      }
                    } catch(e) { /* archivo individual falló — seguir con los demás */ }
                  }
                }

                enviar({ tipo: "completo" });
                controller.close();
              } catch(err) {
                enviar({ tipo: "error", mensaje: err.message });
                controller.close();
              }
              resolverListo();
            }
          });

          ctx.waitUntil(streamListo);

          return new Response(stream, {
            headers: {
              "Content-Type":                "text/plain; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control":               "no-cache",
            }
          });
        }

        return new Response("Acción no soportada", { status: 400,
          headers: { "Access-Control-Allow-Origin": "*" } });

      } catch(err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    if (pathname === "/ai-proxy") {
      try {
        const body = await request.json();
        const { id, configId, modelo, mensaje, modeloGemini, modeloOR, promptSistema } = body;
        if (!id || !modelo || !mensaje) return new Response("Faltan campos", { status: 400,
                                                                              headers: { "Access-Control-Allow-Origin": "*" } });

        const claveConfig = configId ? `historial_${configId}` : `config_${id}`;
        const cfgRaw = await CloudKV.get(claveConfig);
        if (!cfgRaw) return new Response("Config no encontrada — guarda tus API keys primero", { status: 404,
                                                                  headers: { "Access-Control-Allow-Origin": "*" } });
        const cfg = JSON.parse(cfgRaw);

        // ── Leer historial guardado en KV ──
        const claveHistorial = `historial_${id}`;
        const histRaw = await CloudKV.get(claveHistorial);
        const historialCompleto = histRaw ? JSON.parse(histRaw) : [];

        // ── Truncar a presupuesto de ~40K tokens (estimado: 4 chars ≈ 1 token) ──
        const PRESUPUESTO_TOKENS = 40000;
        function truncarPorTokens(historial) {
          let total = 0;
          const resultado = [];
          for (let i = historial.length - 1; i >= 0; i--) {
            const msg = historial[i];
            const tokensAprox = Math.ceil((msg.content || "").length / 4);
            if (total + tokensAprox > PRESUPUESTO_TOKENS) break;
            total += tokensAprox;
            resultado.unshift(msg);
          }
          return resultado;
        }
        const historialTruncado = truncarPorTokens(historialCompleto);

        const promptFinal = promptSistema || "Eres un asistente útil.";

        let apiResp;
        let parsearDelta;

        if (modelo === "claude") {
          if (!cfg.anthropic) return new Response("Sin key Anthropic", { status: 401,
                                                                        headers: { "Access-Control-Allow-Origin": "*" } });
          const payload = {
            model: "claude-sonnet-4-6", max_tokens: 4096, stream: true,
            system: promptFinal,
            messages: [...historialTruncado, { role: "user", content: mensaje }]
          };
          apiResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type":      "application/json",
              "x-api-key":         cfg.anthropic,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(payload)
          });
          parsearDelta = (obj) => {
            if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta")
              return obj.delta.text;
            return "";
          };

        } else if (modelo === "deepseek") {
          if (!cfg.deepseek) return new Response("Sin key DeepSeek", { status: 401,
                                                                      headers: { "Access-Control-Allow-Origin": "*" } });
          const payload = {
            model: "deepseek-chat", stream: true,
            messages: [
              { role: "system", content: promptFinal },
              ...historialTruncado,
              { role: "user", content: mensaje }
            ]
          };
          apiResp = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${cfg.deepseek}`
            },
            body: JSON.stringify(payload)
          });
          parsearDelta = (obj) => obj.choices?.[0]?.delta?.content || "";

        } else if (modelo === "gemini") {
          if (!cfg.gemini) return new Response("Sin key Gemini", { status: 401,
                                                                  headers: { "Access-Control-Allow-Origin": "*" } });
          const modeloGeminiFinal = modeloGemini || "gemini-2.5-flash";
          const historialGemini = historialTruncado.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }));
          historialGemini.push({ role: "user", parts: [{ text: mensaje }] });
          const payload = {
            system_instruction: { parts: [{ text: promptFinal }] },
            contents: historialGemini,
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
          };
          apiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modeloGeminiFinal}:streamGenerateContent?alt=sse&key=${cfg.gemini}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }
          );
          parsearDelta = (obj) => obj.candidates?.[0]?.content?.parts?.[0]?.text || "";

        } else if (modelo === "openrouter") {
          if (!cfg.openrouter) return new Response("Sin key OpenRouter", { status: 401,
                                                                          headers: { "Access-Control-Allow-Origin": "*" } });
          const modeloORFinal = modeloOR || "anthropic/claude-sonnet-4-6";
          const payload = {
            model: modeloORFinal,
            stream: true,
            messages: [
              { role: "system", content: promptFinal },
              ...historialTruncado,
              { role: "user", content: mensaje }
            ]
          };
          apiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${cfg.openrouter}`,
              "HTTP-Referer":  "https://sw-0112358.github.io",
              "X-Title":       "EditorVisorIDE"
            },
            body: JSON.stringify(payload)
          });
          parsearDelta = (obj) => obj.choices?.[0]?.delta?.content || "";

        } else if (modelo === "openai") {
          if (!cfg.openai) return new Response("Sin key OpenAI", { status: 401,
                                                                    headers: { "Access-Control-Allow-Origin": "*" } });
          const modeloOpenAIFinal = body.modeloOpenAI || "gpt-4o";
          const payload = {
            model: modeloOpenAIFinal,
            stream: true,
            messages: [
              { role: "system", content: promptFinal },
              ...historialTruncado,
              { role: "user", content: mensaje }
            ]
          };
          apiResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${cfg.openai}`
            },
            body: JSON.stringify(payload)
          });
          parsearDelta = (obj) => obj.choices?.[0]?.delta?.content || "";

        } else {
          return new Response("Modelo no soportado", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
        }

        // ── Leer el stream, reenviarlo al cliente Y acumular la respuesta completa ──
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let respuestaCompleta = "";

        let resolverGuardado;
        const guardadoListo = new Promise(res => { resolverGuardado = res; });

        const streamTransformado = new ReadableStream({
          async start(controller) {
            const reader = apiResp.body.getReader();
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value); // reenviar tal cual al cliente
              buffer += decoder.decode(value, { stream: true });
              const lineas = buffer.split("\n");
              buffer = lineas.pop();
              for (const linea of lineas) {
                if (!linea.startsWith("data: ")) continue;
                const dato = linea.slice(6).trim();
                if (!dato || dato === "[DONE]") continue;
                try {
                  const fragmento = parsearDelta(JSON.parse(dato));
                  if (fragmento) respuestaCompleta += fragmento;
                } catch(e) { /* ignorar */ }
              }
            }
            controller.close();

            // Guardar historial actualizado (completo, sin truncar) en KV
            try {
              const nuevoHistorial = [
                ...historialCompleto,
                { role: "user", content: mensaje },
                { role: "assistant", content: respuestaCompleta }
              ];
              await CloudKV.put(claveHistorial, JSON.stringify(nuevoHistorial));
            } catch(e) { /* no bloquear el stream por error de guardado */ }
            resolverGuardado();
          }
        });

        // Mantener el Worker vivo hasta que el guardado en KV termine,
        // aunque la Response ya se haya devuelto al cliente.
        ctx.waitUntil(guardadoListo);

        return new Response(streamTransformado, {
          status: apiResp.status,
          headers: {
            "Content-Type":                "text/event-stream",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":               "no-cache",
          }
        });

      } catch(err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }


    if (pathname === "/gtts-init") {
      try {
        // Visitar Google Traductor como haría un humano
        const resp = await fetch("https://translate.google.com/?hl=es", {
          headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
            "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection":      "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest":  "document",
            "Sec-Fetch-Mode":  "navigate",
            "Sec-Fetch-Site":  "none",
            "Sec-Fetch-User":  "?1",
          }
        });

        // Extraer y guardar cookies
        const setCookie = resp.headers.get("set-cookie");
        let cookieGuardada = "";

        if (setCookie) {
          const cookieLimpia = setCookie
          .split(",")
          .map(c => c.split(";")[0].trim())
          .filter(c => c.includes("="))
          .join("; ");
          if (cookieLimpia) {
            await CloudKV.put("gtts_cookie", cookieLimpia, { expirationTtl: 86400 });
            cookieGuardada = cookieLimpia;
          }
        }

        return new Response(JSON.stringify({ 
          ok:      true, 
          cookie:  !!cookieGuardada,
          status:  resp.status,
        }), {
          headers: { 
            "Content-Type":                "application/json", 
            "Access-Control-Allow-Origin": "*" 
          }
        });

      } catch(err) {
        return new Response(JSON.stringify({ 
          ok:    false, 
          error: err.message 
        }), {
          status: 500, 
          headers: { 
            "Content-Type":                "application/json", 
            "Access-Control-Allow-Origin": "*" 
          }
        });
      }
    }


    if (pathname === "/gtts") {
      try {
        const texto = searchParams.get("q") || "";
        if (!texto) return new Response("Falta ?q=", { status: 400,
                                                      headers: { "Access-Control-Allow-Origin": "*" } });

        // Recuperar cookie guardada en KV
        const cookieGuardada = await CloudKV.get("gtts_cookie") || "";

        const resp = await fetch(
          `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(texto)}&tl=es&client=tw-ob&ttsspeed=1`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
              "Referer":    "https://translate.google.com/",
              "Accept":     "*/*",
              "Accept-Language": "es-ES,es;q=0.9",
              "Cookie":     cookieGuardada,
            }
          }
        );

        // Guardar cookies nuevas que Google devuelva
        const setCookie = resp.headers.get("set-cookie");
        if (setCookie) {
          // Parsear y limpiar la cookie para reusar
          const cookieLimpia = setCookie
          .split(",")
          .map(c => c.split(";")[0].trim())
          .filter(c => c.includes("="))
          .join("; ");
          if (cookieLimpia) {
            await CloudKV.put("gtts_cookie", cookieLimpia, { expirationTtl: 86400 });
          }
        }

        if (!resp.ok) {
          return new Response("Google error: " + resp.status, {
            status: resp.status,
            headers: { "Access-Control-Allow-Origin": "*" }
          });
        }

        const buffer = await resp.arrayBuffer();
        return new Response(buffer, {
          headers: {
            "Content-Type":                "audio/mpeg",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":               "public, max-age=3600"
          }
        });

      } catch(err) {
        return new Response("Error: " + err.message, { status: 500,                                                  headers: { "Access-Control-Allow-Origin": "*" }
                                                     });
      }
    }

    // ── /batch-download — descarga secuencial con stream, genérico ──
    if (pathname === "/batch-download") {
      try {
        const dataParam = searchParams.get("data");
        let body;
        if (dataParam) {
          body = JSON.parse(decodeURIComponent(dataParam));
        } else {
          const texto = await request.text();
          if (!texto || !texto.trim()) return new Response("Falta urls[]", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
          body = JSON.parse(texto);
        }
        const urls    = body.urls;
        const headers = body.headers || {
          "Referer":         body.referer || "",
          "User-Agent":      "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
          "Accept":          "image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9",
        };
        if (!Array.isArray(urls) || !urls.length)
          return new Response("Falta urls[]", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });

        const encoder = new TextEncoder();
        const stream  = new ReadableStream({
          async start(controller) {
            for (let i = 0; i < urls.length; i++) {
              const { nombre, url } = urls[i];
              try {
                const resp = await fetch(url, { headers });
                if (!resp.ok) {
                  const meta = JSON.stringify({ ok: false, nombre, indice: i, error: resp.status });
                  controller.enqueue(encoder.encode(meta + "\x1e"));
                  continue;
                }
                const buffer      = await resp.arrayBuffer();
                const contentType = resp.headers.get("content-type") || "image/webp";
                if (!contentType.startsWith("image/")) {
                  const meta = JSON.stringify({ ok: false, nombre, indice: i, error: "no-imagen" });
                  controller.enqueue(encoder.encode(meta + "\x1e"));
                  continue;
                }
               
                
                const bytes   = new Uint8Array(buffer);
                // Chunk múltiplo de 3 para evitar padding intermedio
                const CHUNK   = 8190; // 8190 = 2730 * 3
                let b64 = '';
                for (let b = 0; b < bytes.length; b += CHUNK) {
                  b64 += btoa(String.fromCharCode(...bytes.subarray(b, b + CHUNK)));
                }
                const b64clean = b64.replace(/[\r\n]/g, '');              
                const meta = JSON.stringify({ ok: true, nombre, indice: i, tipo: contentType, size: buffer.byteLength });
                controller.enqueue(encoder.encode(meta + "\x1e" + b64clean + "\x1e"));
             
              
              } catch(err) {
                const meta = JSON.stringify({ ok: false, nombre, indice: i, error: err.message });
                controller.enqueue(encoder.encode(meta + "\x1e"));
              }
            }
            controller.enqueue(encoder.encode(JSON.stringify({ ok: true, fin: true }) + "\x1e"));
            controller.close();
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type":                "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":               "no-cache",
            "X-Content-Type-Options":      "nosniff",
          }
        });
      } catch(err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    const targetURL = new URL(target);
    const siteBase = `${targetURL.protocol}//${targetURL.host}`;


    // ── /raw — contenido tal cual sin reescritura ──
    if (pathname === "/raw") {
      try {
        const targetHost     = new URL(target).hostname;
        const cookieKey      = "fh_cookie_" + targetHost.replace(/\./g, "_");
        const cookieGuardada = await CloudKV.get(cookieKey) || "";

        const respuesta = await fetch(target, {
          method: request.method,
          headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept":          "*/*",
            "Accept-Language": "es-ES,es;q=0.9",
            "Referer":         siteBase,
            "Cookie":          cookieGuardada,
          },
        });

        // Guardar cookies nuevas
        const setCookie = respuesta.headers.get("set-cookie");
        if (setCookie) {
          const nueva = setCookie.split(",")
            .map(c => c.trim().split(";")[0].trim())
            .filter(Boolean)
            .join("; ");
          if (nueva) await CloudKV.put(cookieKey, nueva, { expirationTtl: 3600 });
        }

        const buffer      = await respuesta.arrayBuffer();
        const contentType = respuesta.headers.get("content-type") || "application/octet-stream";
        return new Response(buffer, {
          status: respuesta.status,
          headers: {
            "Content-Type":                contentType,
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response("Error: " + err.message, { status: 500 });
      }
    }

    // ── /proxy-img — imagen con Referer personalizable (genérico) ──
    if (pathname === "/proxy-img") {
      try {
        const referer = searchParams.get("referer") || siteBase;
        const resp = await fetch(target, {
          headers: {
            "Referer":          referer,
            "User-Agent":       "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
            "Accept":           "image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language":  "es-ES,es;q=0.9",
          }
        });
        const buffer      = await resp.arrayBuffer();
        const contentType = resp.headers.get("content-type") || "image/webp";
        return new Response(buffer, {
          status: resp.status,
          headers: {
            "Content-Type":                contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":               "public, max-age=86400",
          }
        });
      } catch(err) {
        return new Response("Error: " + err.message, {
          status: 500, headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /fetch-html — fetch genérico simulando navegación real (con cookies por dominio) ──
    if (pathname === "/fetch-html") {
      try {
        const referer    = searchParams.get("referer") || siteBase;
        const origin     = new URL(referer).origin;
        const targetHost = new URL(target).hostname;
        const cookieKey  = "fh_cookie_" + targetHost.replace(/\./g, "_");

        // Recuperar cookie guardada para este dominio
        const cookieGuardada = await CloudKV.get(cookieKey) || "";

        const resp = await fetch(target, {
          headers: {
            "User-Agent":                "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
            "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language":           "es-ES,es;q=0.9,en;q=0.8",
            "Accept-Encoding":           "gzip, deflate, br",
            "Referer":                   referer,
            "Origin":                    origin,
            "Cookie":                    cookieGuardada,
            "sec-ch-ua":                 '"Chromium";v="124", "Google Chrome";v="124"',
            "sec-ch-ua-mobile":          "?1",
            "sec-ch-ua-platform":        '"Android"',
            "sec-fetch-dest":            "document",
            "sec-fetch-mode":            "navigate",
            "sec-fetch-site":            "same-origin",
            "sec-fetch-user":            "?1",
            "Upgrade-Insecure-Requests": "1",
          }
        });

        // Guardar cookies nuevas en KV por dominio
        const setCookie = resp.headers.get("set-cookie");
        if (setCookie) {
          const nueva = setCookie.split(",")
            .map(c => c.trim().split(";")[0].trim())
            .filter(Boolean)
            .join("; ");
          if (nueva) await CloudKV.put(cookieKey, nueva, { expirationTtl: 3600 });
        }

        const buffer = await resp.arrayBuffer();
        return new Response(buffer, {
          status: resp.status,
          headers: {
            "Content-Type":                resp.headers.get("content-type") || "text/html",
            "Access-Control-Allow-Origin": "*",
          }
        });
      } catch(err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // ── /api — endpoint limpio para AJAX/JSF sin reescritura ──
    if (pathname === "/api") {
      const fetchOptions = {
        method: request.method,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "es-ES,es;q=0.9",
          "Referer": siteBase,
          "Origin": siteBase,
        },
      };
      if (request.method === "POST") {
        const ct = request.headers.get("content-type") || "";
        fetchOptions.headers["Content-Type"] = ct;
        fetchOptions.headers["Faces-Request"] = "partial/ajax";
        fetchOptions.body = await request.arrayBuffer();
      }
      const resp = await fetch(target, fetchOptions);
      const ct   = resp.headers.get("content-type") || "";
      const buf  = await resp.arrayBuffer();
      return new Response(buf, {
        status: resp.status,
        headers: {
          "Content-Type": ct,
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const fetchOptions = {
        method: request.method,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9",
          "Referer": siteBase,
          "Origin": siteBase,
        },
      };

      if (request.method === "POST") {
        const ct = request.headers.get("content-type") || "";
        fetchOptions.headers["Content-Type"] = ct;
        fetchOptions.body = await request.arrayBuffer();
      }

      const respuesta = await fetch(target, fetchOptions);
      const contentType = respuesta.headers.get("content-type") || "text/html";

      if (contentType.includes("text/html")) {
        let html = await respuesta.text();

        function resolverURL(url) {
          if (!url) return url;
          try { return new URL(url, targetURL).href; }
          catch { return url; }
        }

        function proxearURL(url) {
          if (!url) return url;
          const trim = url.trim();
          if (trim.startsWith("data:") || trim.startsWith("blob:") ||
              trim.startsWith("#")     || trim.startsWith("javascript:")) return url;
          return `${proxyBase}/url?target=${encodeURIComponent(resolverURL(trim))}`;
        }

        html = html
          .replace(/(src|href|action)=(["'])([^"']*)\2/gi, (_, attr, q, url) =>
                   `${attr}=${q}${proxearURL(url)}${q}`)
          .replace(/srcset=(["'])([^"']+)\1/gi, (_, q, srcset) => {
          const nuevo = srcset.replace(/([^\s,][^\s,]*\.[^\s,]+)(\s+[\d.]+[wx])?/g,
                                       (m, url, desc) => proxearURL(url.trim()) + (desc || ""));
          return `srcset=${q}${nuevo}${q}`;
        })
          .replace(/url\((["']?)([^"')]+)\1\)/gi, (_, q, url) =>
                   `url(${q}${proxearURL(url)}${q})`);

        const scriptInyectado = `
<script>
(function() {
  const PROXY = "${proxyBase}/url?target=";
  const BASE  = "${siteBase}";
  function proxearDinamico(url) {
    if (!url) return url;
    try {
      const abs = new URL(url, BASE).href;
      if (abs.startsWith("${proxyBase}")) return abs;
      return PROXY + encodeURIComponent(abs);
    } catch { return url; }
  }
  const _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === "string") input = proxearDinamico(input);
    else if (input instanceof Request) input = new Request(proxearDinamico(input.url), input);
    return _fetch.call(this, input, init);
  };
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return _open.call(this, method, proxearDinamico(url), ...rest);
  };
  document.addEventListener("click", function(e) {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    try {
      const abs = new URL(href, BASE).href;
      if (!abs.startsWith("${proxyBase}")) {
        e.preventDefault();
        window.location.href = PROXY + encodeURIComponent(abs);
      }
    } catch {}
  }, true);
})();
<\/script>`;

        html = html.includes("</head>")
          ? html.replace("</head>", scriptInyectado + "</head>")
        : scriptInyectado + html;

        return new Response(html, {
          status: respuesta.status,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "X-Frame-Options": "ALLOWALL",
            "Content-Security-Policy": "frame-ancestors *",
          },
        });
      }

      // Recursos no-HTML
      const buffer = await respuesta.arrayBuffer();
      const headers = {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      };
      if (pathname === "/download") {
        const nombreFinal = nombre || target.split("/").pop() || "archivo";
        headers["Content-Disposition"] = `attachment; filename="${nombreFinal}"`;
      }
      return new Response(buffer, { status: respuesta.status, headers });

    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  },
};
