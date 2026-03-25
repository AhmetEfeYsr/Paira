/**
 * GameStateManager - A simple Vanilla JS state manager.
 * Provides a standardized way to get, set, and listen to state changes.
 */
class GameStateManager {
    /**
     * @param {Object} initialState - The starting state object.
     */
    constructor(initialState = {}) {
        this.state = { ...initialState };
        this.listeners = [];
    }

    /**
     * Updates the state with a partial object and notifies listeners.
     * @param {Object} partialState 
     */
    setState(partialState) {
        this.state = { ...this.state, ...partialState };
        this.notifyListeners();
    }

    /**
     * Gets the current state.
     * @returns {Object}
     */
    getState() {
        return this.state;
    }

    /**
     * Adds a listener for state changes.
     * @param {function(Object)} callback 
     * @returns {function()} unsubscribe function
     */
    subscribe(callback) {
        this.listeners.push(callback);
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Notifies all listeners with the current state.
     */
    notifyListeners() {
        this.listeners.forEach(callback => callback(this.state));
    }
}

window.GameStateManager = GameStateManager;
