@extends('layouts.app')

@section('content')
<div class="max-w-md mx-auto bg-white p-6 rounded-lg shadow-sm">
	<h1 class="text-2xl font-bold mb-4">Connexion</h1>

	@if (!empty($error))
		<div class="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-sm">{{ $error }}</div>
	@endif

	<form method="post" action="/login" class="space-y-4" data-submit-once>
		<input type="hidden" name="token" value="{{ $csrf }}">

		<div>
			<label class="block text-sm font-medium mb-1" for="login">Email</label>
			<input id="login" name="login" type="email" required autocomplete="username"
				class="w-full border border-slate-300 rounded px-3 py-2">
		</div>

		<div>
			<label class="block text-sm font-medium mb-1" for="password">Mot de passe</label>
			<input id="password" name="password" type="password" required autocomplete="current-password"
				class="w-full border border-slate-300 rounded px-3 py-2">
		</div>

		<button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold py-2 rounded" data-loading-text="Connexion en cours...">
			Se connecter
		</button>
	</form>

	<div class="text-sm text-slate-500 mt-4 flex justify-between">
		<a href="/forgot" class="underline">Mot de passe oublié ?</a>
		<a href="/signup" class="underline">Créer un compte</a>
	</div>
</div>
@endsection
