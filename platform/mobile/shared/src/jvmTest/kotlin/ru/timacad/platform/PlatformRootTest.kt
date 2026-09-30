package ru.timacad.platform

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.Lifecycle
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.arkivanov.essenty.lifecycle.destroy
import com.arkivanov.essenty.lifecycle.resume
import com.arkivanov.essenty.statekeeper.StateKeeperDispatcher
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PlatformRootTest {
    @Test
    fun navigationRestoresStackAndBackResumesPreviousChild() {
        val lifecycle = LifecycleRegistry()
        val keeper = StateKeeperDispatcher()
        val root = PlatformRoot(DefaultComponentContext(lifecycle, stateKeeper = keeper))
        lifecycle.resume()
        root.select(HomeTab.Notes)
        root.select(HomeTab.Settings)
        root.select(HomeTab.Notes)
        assertEquals(HomeTab.Notes, root.stack.value.active.instance.tab)
        assertEquals(2, root.stack.value.backStack.size)
        assertEquals(Lifecycle.State.RESUMED, root.stack.value.active.instance.lifecycle.state)
        assertTrue(root.stack.value.backStack.all { it.instance.lifecycle.state != Lifecycle.State.RESUMED })
        val saved = keeper.save()
        lifecycle.destroy()

        val restoredLifecycle = LifecycleRegistry()
        val back = BackDispatcher()
        val restored = PlatformRoot(DefaultComponentContext(restoredLifecycle, stateKeeper = StateKeeperDispatcher(saved), backHandler = back))
        restoredLifecycle.resume()
        assertEquals(HomeTab.Notes, restored.stack.value.active.instance.tab)
        assertTrue(back.isEnabled)
        back.back()
        assertEquals(HomeTab.Settings, restored.stack.value.active.instance.tab)
        assertEquals(Lifecycle.State.RESUMED, restored.stack.value.active.instance.lifecycle.state)
        back.back()
        assertEquals(HomeTab.Day, restored.stack.value.active.instance.tab)
        assertFalse(back.isEnabled)
        restoredLifecycle.destroy()
    }
}
