package host.vanilla.core.games;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import org.bukkit.Sound;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Кости на ставку между игроками рядом. Деньги двигает сайт: плагин только
 * сводит игроков, бросает кубики и сообщает результат — так проигравший не
 * успеет потратить ставку, а сервер не сможет «напечатать» выплату.
 */
public final class DiceGame {

    /** Приглашение живёт минуту: дальше вызов протухает сам. */
    private static final long INVITE_TTL_MS = 60_000;

    private record Invite(UUID from, int amount, long createdAt) {}

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    /** Кому брошен вызов → от кого и на сколько. */
    private final Map<UUID, Invite> invites = new HashMap<>();

    public DiceGame(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    /** /cubes <сумма> — вызвать ближайшего игрока. */
    public void challenge(Player player, int amount) {
        if (amount <= 0) {
            player.sendMessage(messages.get("dice.usage"));
            return;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("dice.jailed"));
            return;
        }

        Player target = nearest(player);
        if (target == null) {
            player.sendMessage(messages.get("dice.no-one", Map.of(
                    "radius", String.valueOf(plugin.config().diceRadius))));
            return;
        }

        invites.put(target.getUniqueId(), new Invite(player.getUniqueId(), amount, System.currentTimeMillis()));
        player.sendMessage(messages.get("dice.sent", Map.of(
                "player", Accounts.name(target),
                "amount", String.valueOf(amount))));
        target.sendMessage(messages.get("dice.invite", Map.of(
                "player", Accounts.name(player),
                "amount", String.valueOf(amount))));
        target.playSound(target.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 0.8f, 1.4f);
    }

    /** /cubes accept — принять вызов и сыграть. */
    public void accept(Player player) {
        Invite invite = invites.remove(player.getUniqueId());
        if (invite == null || System.currentTimeMillis() - invite.createdAt() > INVITE_TTL_MS) {
            player.sendMessage(messages.get("dice.no-invite"));
            return;
        }

        Player challenger = plugin.getServer().getPlayer(invite.from());
        if (challenger == null || !challenger.isOnline()) {
            player.sendMessage(messages.get("dice.gone"));
            return;
        }
        // Пока думали, могли разойтись — расстояние проверяем ещё раз.
        if (!nearEnough(challenger, player)) {
            player.sendMessage(messages.get("dice.too-far", Map.of(
                    "radius", String.valueOf(plugin.config().diceRadius))));
            challenger.sendMessage(messages.get("dice.too-far", Map.of(
                    "radius", String.valueOf(plugin.config().diceRadius))));
            return;
        }

        plugin.api().onMain(
                plugin.api().post("/api/mc/dice", Map.of(
                        "action", "start",
                        "challengerLogin", Accounts.name(challenger),
                        "opponentLogin", Accounts.name(player),
                        "amount", invite.amount())),
                response -> {
                    String status = response.has("status") ? response.get("status").getAsString() : "error";
                    if (!"ok".equals(status)) {
                        String error = response.has("error")
                                ? response.get("error").getAsString()
                                : "сайт не отвечает";
                        challenger.sendMessage(messages.get("dice.failed", Map.of("reason", error)));
                        player.sendMessage(messages.get("dice.failed", Map.of("reason", error)));
                        return;
                    }
                    roll(response.get("matchId").getAsString(), challenger, player, invite.amount());
                });
    }

    /** /cubes deny — отказаться. */
    public void deny(Player player) {
        Invite invite = invites.remove(player.getUniqueId());
        if (invite == null) {
            player.sendMessage(messages.get("dice.no-invite"));
            return;
        }
        Player challenger = plugin.getServer().getPlayer(invite.from());
        if (challenger != null) {
            challenger.sendMessage(messages.get("dice.denied", Map.of("player", Accounts.name(player))));
        }
        player.sendMessage(messages.get("dice.denied-you"));
    }

    /** Бросок с анимацией: сначала кубики, потом итог. */
    private void roll(String matchId, Player challenger, Player opponent, int amount) {
        int first = ThreadLocalRandom.current().nextInt(1, 7);
        int second = ThreadLocalRandom.current().nextInt(1, 7);

        for (Player watcher : nearby(challenger)) {
            watcher.sendMessage(messages.get("dice.rolling", Map.of(
                    "a", Accounts.name(challenger),
                    "b", Accounts.name(opponent),
                    "amount", String.valueOf(amount))));
            watcher.playSound(watcher.getLocation(), Sound.BLOCK_STONE_BUTTON_CLICK_ON, 0.9f, 1.2f);
        }

        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            for (Player watcher : nearby(challenger)) {
                watcher.sendMessage(messages.get("dice.result", Map.of(
                        "a", Accounts.name(challenger),
                        "ra", String.valueOf(first),
                        "b", Accounts.name(opponent),
                        "rb", String.valueOf(second))));
            }

            // Ничья: возвращаем ставки и предлагаем бросить заново.
            if (first == second) {
                plugin.api().post("/api/mc/dice", Map.of("action", "refund", "matchId", matchId));
                challenger.sendMessage(messages.get("dice.draw"));
                opponent.sendMessage(messages.get("dice.draw"));
                return;
            }

            plugin.api().onMain(
                    plugin.api().post("/api/mc/dice", Map.of(
                            "action", "finish",
                            "matchId", matchId,
                            "challengerRoll", first,
                            "opponentRoll", second)),
                    response -> {
                        if (!"ok".equals(response.has("status") ? response.get("status").getAsString() : "")) {
                            challenger.sendMessage(messages.get("dice.payout-failed"));
                            opponent.sendMessage(messages.get("dice.payout-failed"));
                            return;
                        }
                        String winner = response.get("winnerLogin").getAsString();
                        int pot = response.get("pot").getAsInt();
                        for (Player watcher : nearby(challenger)) {
                            watcher.sendMessage(messages.get("dice.winner", Map.of(
                                    "player", winner, "pot", String.valueOf(pot))));
                            watcher.playSound(watcher.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 0.7f, 1.3f);
                        }
                    });
        }, 40L);
    }

    /** Ближайший игрок в радиусе — с ним и играем. */
    private Player nearest(Player player) {
        Player best = null;
        double bestDistance = Double.MAX_VALUE;
        double radius = plugin.config().diceRadius;

        for (Player other : player.getWorld().getPlayers()) {
            if (other.equals(player)) continue;
            if (!plugin.auth().authenticated(other)) continue;
            if (plugin.jail().isJailed(other)) continue;
            double distance = other.getLocation().distance(player.getLocation());
            if (distance <= radius && distance < bestDistance) {
                best = other;
                bestDistance = distance;
            }
        }
        return best;
    }

    private boolean nearEnough(Player a, Player b) {
        return a.getWorld().equals(b.getWorld())
                && a.getLocation().distance(b.getLocation()) <= plugin.config().diceRadius;
    }

    /** Зрители: партию видят все, кто стоит рядом. */
    private java.util.List<Player> nearby(Player center) {
        java.util.List<Player> watchers = new java.util.ArrayList<>();
        for (Player other : center.getWorld().getPlayers()) {
            if (other.getLocation().distance(center.getLocation()) <= plugin.config().diceRadius + 8) {
                watchers.add(other);
            }
        }
        return watchers;
    }
}
