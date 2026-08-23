package host.vanilla.core.api;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.plugin.Plugin;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.logging.Level;

/**
 * Клиент к API сайта. Все вызовы асинхронные: сетевой запрос в главном потоке
 * сервера — это лаг для всех игроков сразу.
 */
public final class ApiClient {

    private static final Gson GSON = new Gson();

    private final Plugin plugin;
    private final String baseUrl;
    private final String token;
    private final HttpClient http;

    public ApiClient(Plugin plugin, String baseUrl, String token) {
        this.plugin = plugin;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.token = token;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public CompletableFuture<JsonObject> post(String path, Map<String, ?> body) {
        HttpRequest request = base(path)
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
                .header("Content-Type", "application/json")
                .build();
        return send(request, path);
    }

    public CompletableFuture<JsonObject> get(String path) {
        return send(base(path).GET().build(), path);
    }

    private HttpRequest.Builder base(String path) {
        return HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(15))
                .header("X-Server-Token", token)
                .header("Accept", "application/json");
    }

    private CompletableFuture<JsonObject> send(HttpRequest request, String path) {
        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(response -> {
                    try {
                        JsonObject json = JsonParser.parseString(response.body()).getAsJsonObject();
                        json.addProperty("_status", response.statusCode());
                        return json;
                    } catch (Exception e) {
                        plugin.getLogger().warning("Некорректный ответ API " + path + ": " + response.body());
                        JsonObject error = new JsonObject();
                        error.addProperty("_status", response.statusCode());
                        error.addProperty("error", "bad_response");
                        return error;
                    }
                })
                .exceptionally(throwable -> {
                    plugin.getLogger().log(Level.WARNING, "Запрос к API не прошёл: " + path, throwable);
                    JsonObject error = new JsonObject();
                    error.addProperty("_status", 0);
                    error.addProperty("error", "network");
                    return error;
                });
    }

    /** Возвращает выполнение в главный поток сервера — там можно трогать игроков. */
    public <T> void onMain(CompletableFuture<T> future, java.util.function.Consumer<T> handler) {
        future.thenAccept(value ->
                plugin.getServer().getScheduler().runTask(plugin, () -> handler.accept(value)));
    }
}
