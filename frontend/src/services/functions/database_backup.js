import server from "../server";

export async function getBackupSchools() {
    const res = await server.get("/api/backup", { params: { scope: "schools" } });
    return res.data.schools;
}

export async function downloadDatabaseBackup(scope = "full", school = null) {
    try {
        const started = await server.post("/api/backup", {
            scope, ...(scope === "school" ? { school } : {}),
        });
        const job = started.data.job;
        let info = started.data;
        while (info.status === "preparing") {
            await new Promise(resolve => window.setTimeout(resolve, 2000));
            const progress = await server.get("/api/backup", { params: { scope: "status", job } });
            info = progress.data;
        }
        if (info.status !== "ready") return [500, info.message || "Backup failed."];
        const res = await server.get("/api/backup", {
            params: { scope: "download", job },
            responseType: "blob",
        });
        const disposition = res.headers?.["content-disposition"] || "";
        const match = disposition.match(/filename="?([^";]+)"?/i);
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = match?.[1] || `smsysdb_${scope}_${ts}.${scope === "school" ? "zip" : "gz"}`;

        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        return [200, info.missing_files
            ? `Backup downloaded. ${info.missing_files} referenced file(s) were already missing from storage; see missing_files in manifest.json.`
            : "Backup downloaded."];
    } catch (e) {
        // Error body may be a Blob if responseType was blob; try to parse it.
        let message = e?.response?.data?.message || e?.message || "Backup failed.";
        const blob = e?.response?.data;
        if (blob && typeof blob.text === "function") {
            try {
                const text = await blob.text();
                const parsed = JSON.parse(text);
                message = parsed?.message || message;
            } catch (_) { }
        }
        return [e?.response?.status || 400, message];
    }
}
