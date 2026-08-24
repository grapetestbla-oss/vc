package host.vanilla.core.admin;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Поручения с сайта: сейчас это очистка инвентаря после обнуления аккаунта.
 * Выполняем только для игроков в сети, остальные поручения остаются в очереди
 * и подтверждаются, лишь когда действительно исполнены.
 */
public final class ActionRunner {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public ActionRunner(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public void poll() {
        if (plugin.getServer().getOnlinePlayers().isEmpty()) return;

        plugin.api().onMain(plugin.api().get("/api/mc/actions"), response -> {
            if (response.get("_status").getAsInt() != 200 || !response.has("actions")) return;

            JsonArray items = response.getAsJsonArray("actions");
            List<String> done = new ArrayList<>();

            for (int i = 0; i < items.size(); i++) {
                JsonObject item = items.get(i).getAsJsonObject();
                String login = item.get("login").getAsString();
                Player player = Accounts.findOnline(login);
                if (player == null || !plugin.auth().authenticated(player)) continue;

                if ("WIPE_INVENTORY".equals(item.get("kind").getAsString()) && wipe(player)) {
                    done.add(item.get("id").getAsString());
                }
            }

            if (!done.isEmpty()) {
                plugin.api().post("/api/mc/actions", Map.of("ids", done));
            }
        });
    }

    /** Полная очистка: инвентарь, эндер-сундук, опыт и эффекты. */
    private boolean wipe(Player player) {
        player.getInventory().clear();
        player.getInventory().setArmorContents(null);
        player.getInventory().setItemInOffHand(null);
        player.getEnderChest().clear();
        player.setLevel(0);
        player.setExp(0f);
        player.setTotalExperience(0);
        player.getActivePotionEffects().forEach(effect -> player.removePotionEffect(effect.getType()));
        player.sendMessage(messages.get("admin.wiped"));
        plugin.getLogger().info("Инвентарь игрока " + player.getName() + " очищен по поручению сайта");
        return true;
    }
}
