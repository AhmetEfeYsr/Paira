class KatiplikNetwork extends PeerManager {
    constructor(game) {
        super(game);
    }

    onConnectionEstablished() {
        super.onConnectionEstablished();
        
        if (this.game.isHost) {
            // İki kişi bağlandığında ve host olduğumuzda
            this.game.opponentName = 'Rakip';
            
            // Rakibe bilgi gönder
            setTimeout(() => {
                this.sendMessage({
                    type: 'player_info',
                    name: this.game.playerName
                });
                
                // Kurucuysa kategorileri getir
                this.game.loadCategories();
            }, 500);
        }
    }

    onMessageReceived(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'player_info':
                this.game.opponentName = data.name;
                document.getElementById('p2-name').textContent = data.name;
                
                // Eğer join olan tarafsak, kendi ismimizi gönderelim
                if (!this.game.isHost && this.game.opponentName) {
                    this.sendMessage({
                        type: 'player_info',
                        name: this.game.playerName
                    });
                }
                break;
                
            case 'game_start':
                this.game.startGame(data.text);
                break;
                
            case 'progress_update':
                this.game.updateOpponentProgress(data.progress, data.wpm);
                break;
                
            case 'game_finished':
                this.game.opponentFinished(data.time, data.wpm, data.accuracy);
                break;
                
            case 'play_again':
                this.game.resetGame();
                break;
        }
    }
}
