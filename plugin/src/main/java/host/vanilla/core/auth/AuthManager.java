package host.vanilla.core.auth;

import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import org.bukkit.GameMode;
import org.bukkit.entity.Player;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Вход по логину и паролю с сайта. Пока игрок не авторизован — он заморожен,
 * ослеплён и не может ничего, кроме /login и /2fa.
 */
public final class AuthManager {

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    private final Map<UUID, Profile> profiles = new ConcurrentHashMap<>();

    public AuthManager(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public Profile profile(Player player) {
        return profiles.computeIfAbsent(player.getUniqueId(), id -> new Profile());
    }

    public Profile profileOrNull(UUID uuid) {
        return profiles.get(uuid);
    }

    public boolean authenticated(Player player) {
        Profile profile = profiles.get(player.getUniqueId());
        return profile != null && profile.authenticated();
    }

    public int adminLevel(Player player) {
        Profile profile = profiles.get(player.getUniqueId());
        return profile == null ? 0 : profile.adminLevel();
    }

    public void forget(Player player) {
        profiles.remove(player.getUniqueId());
    }

    /** Заход на сервер: гасим игрока и ждём пароль. */
    public void onJoin(Player player) {
        Profile profile = profile(player);
        profile.setState(Profile.State.AWAITING_LOGIN);
        restrain(player);
        player.sendMessage(messages.get("auth.prompt"));

        int timeout = plugin.config().authTimeoutSeconds;
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            if (player.isOnline() && !authenticated(player)) {
                player.kick(messages.get("auth.timeout"));
            }
        }, timeout * 20L);
    }

    private void restrain(Player player) {
        player.setGameMode(GameMode.ADVENTURE);
        player.setWalkSpeed(0f);
        player.setFlySpeed(0f);
        player.addPotionEffect(new PotionEffect(PotionEffectType.BLINDNESS, Integer.MAX_VALUE, 1, false, false));
    }

    private void release(Player player) {
        player.setGameMode(GameMode.SURVIVAL);
        player.setWalkSpeed(0.2f);
        player.setFlySpeed(0.1f);
        player.removePotionEffect(PotionEffectType.BLINDNESS);
    }

    public void login(Player player, String password) {
        Profile profile = profile(player);
        if (profile.authenticated()) {
            player.sendMessage(messages.get("auth.already"));
            return;
        }

        String ip = ip(player);
        plugin.api().onMain(
                plugin.api().post("/api/mc/login", Map.of(
                        "login", player.getName(),
                        "password", password,
                        "ip", ip)),
                response -> handleLogin(player, profile, response));
    }

    public void twoFactor(Player player, String code) {
        Profile profile = profile(player);
        if (profile.state() != Profile.State.AWAITING_2FA) {
            player.sendMessage(messages.get("auth.no2fa"));
            return;
        }
        plugin.api().onMain(
                plugin.api().post("/api/mc/twofa", Map.of(
                        "login", player.getName(),
                        "code", code,
                        "ip", ip(player))),
                response -> handleLogin(player, profile, response));
    }

    private void handleLogin(Player player, Profile profile, JsonObject response) {
        if (!player.isOnline()) return;
        String status = response.has("status") ? response.get("status").getAsString() : "error";

        switch (status) {
            case "ok" -> {
                profile.setState(Profile.State.AUTHENTICATED);
                if (response.has("profile")) {
                    JsonObject data = response.getAsJsonObject("profile");
                    profile.setAdminLevel(data.get("adminLevel").getAsInt());
                    profile.setLevel(data.get("level").getAsInt());
                    profile.setBalanceVc(data.get("balanceVc").getAsInt());
                }
                release(player);
                player.sendMessage(messages.get("auth.welcome", Map.of("player", player.getName())));
                plugin.onPlayerAuthenticated(player);
            }
            case "2fa_required" -> {
                profile.setState(Profile.State.AWAITING_2FA);
                player.sendMessage(messages.get("auth.need2fa"));
            }
            case "no_account" -> player.kick(messages.get("auth.no-account"));
            case "banned" -> {
                String reason = response.has("reason") ? response.get("reason").getAsString() : "—";
                player.kick(messages.plain("auth.banned", Map.of("reason", reason)));
            }
            case "bad_password", "bad_code" -> {
                int attempts = profile.registerFailure();
                if (attempts >= plugin.config().maxLoginAttempts) {
                    player.kick(messages.get("auth.too-many"));
                } else {
                    player.sendMessage(messages.get("auth.bad", Map.of(
                            "left", String.valueOf(plugin.config().maxLoginAttempts - attempts))));
                }
            }
            case "rate_limited" -> player.kick(messages.get("auth.rate-limited"));
            case "expired", "no_code" -> player.sendMessage(messages.get("auth.code-expired"));
            default -> {
                player.sendMessage(messages.get("auth.api-down"));
                plugin.getLogger().warning("Не удалось авторизовать " + player.getName() + ": " + response);
            }
        }
    }

    public static String ip(Player player) {
        return player.getAddress() == null ? "0.0.0.0" : player.getAddress().getAddress().getHostAddress();
    }

    public Component prompt() {
        return messages.get("auth.prompt");
    }
}
