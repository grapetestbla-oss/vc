package host.vanilla.demorgan;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.logging.Level;

/** Лог выдачи и снятия наказаний в Discord. Без него админку невозможно контролировать. */
public final class DiscordLogger {

    private final DemorganPlugin plugin;
    private final String webhookUrl;
    private final HttpClient http;

    public DiscordLogger(DemorganPlugin plugin, String webhookUrl) {
        this.plugin = plugin;
        this.webhookUrl = webhookUrl;
        this.http = webhookUrl.isEmpty() ? null
                : HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public void log(String text) {
        if (http == null) return;
        String payload = "{\"content\":\"" + escape(text) + "\"}";
        HttpRequest request = HttpRequest.newBuilder(URI.create(webhookUrl))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();
        http.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                .exceptionally(e -> {
                    plugin.getLogger().log(Level.WARNING, "Не удалось отправить лог в Discord", e);
                    return null;
                });
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "");
    }
}
