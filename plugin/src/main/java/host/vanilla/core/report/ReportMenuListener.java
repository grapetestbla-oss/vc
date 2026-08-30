package host.vanilla.core.report;

import host.vanilla.core.VanillaCorePlugin;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;

/** Клик по репорту в меню — попытка взять его себе. */
public final class ReportMenuListener implements Listener {

    private final VanillaCorePlugin plugin;
    private final ReportManager reports;

    public ReportMenuListener(VanillaCorePlugin plugin, ReportManager reports) {
        this.plugin = plugin;
        this.reports = reports;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        var holder = event.getInventory().getHolder();
        if (!(holder instanceof ReportMenuHolder) && !(holder instanceof ReportActionHolder)) return;

        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player admin)) return;
        if (plugin.auth().adminLevel(admin) < 2) return;

        if (holder instanceof ReportActionHolder actions) {
            handleAction(admin, actions.entry(), event.getSlot());
            return;
        }

        ReportManager.Entry entry = reports.entryAt(event.getSlot());
        if (entry == null) return;

        // Уже взятый собой репорт открываем сразу в разбор, чужой не трогаем.
        if (entry.claimedBy() != null) {
            if (entry.claimedBy().equalsIgnoreCase(admin.getName())) {
                reports.openActions(admin, entry);
            } else {
                admin.sendMessage(plugin.messages().get("report.taken"));
            }
            return;
        }

        admin.closeInventory();
        reports.claim(admin, entry);
    }

    /** Кнопки в меню взятого репорта. */
    private void handleAction(Player admin, ReportManager.Entry entry, int slot) {
        switch (slot) {
            case ReportManager.SLOT_TP_TO -> {
                admin.closeInventory();
                reports.teleport(admin, entry, false);
            }
            case ReportManager.SLOT_TP_HERE -> {
                admin.closeInventory();
                reports.teleport(admin, entry, true);
            }
            case ReportManager.SLOT_CLOSE -> {
                admin.closeInventory();
                reports.close(admin, entry.id(), "разобрано в игре");
            }
            case ReportManager.SLOT_BACK -> reports.openMenu(admin);
            default -> {
                // Информационная табличка и пустые слоты — просто ничего.
            }
        }
    }
}
