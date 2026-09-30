package ru.timacad.platform

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.decompose.router.stack.StackNavigation
import com.arkivanov.decompose.router.stack.navigate
import com.arkivanov.decompose.router.stack.childStack

/** Created by the platform host on Main, before composition. */
class PlatformRoot(componentContext: ComponentContext) : ComponentContext by componentContext {
    private val navigation = StackNavigation<HomeTab>()
    val stack = childStack(
        source = navigation,
        serializer = HomeTab.serializer(),
        initialConfiguration = HomeTab.Day,
        handleBackButton = true,
        childFactory = ::Screen,
    )

    // Enum configurations share a class, so match their values, not their class.
    fun select(tab: HomeTab) = navigation.navigate { previous -> previous.filterNot { it == tab } + tab }

    class Screen(val tab: HomeTab, componentContext: ComponentContext) : ComponentContext by componentContext
}
